/**
 * routes/simulate.js
 *
 * POST /api/simulate
 *   Jalankan simulasi fisika race untuk satu uma (single-horse MVP).
 *   Return snapshot per-section + RuntimeContext untuk evaluasi skill.
 *
 * POST /api/simulate/skill-check
 *   Evaluasi apakah skill tertentu bisa aktif, berdasarkan hasil simulasi
 *   + kondisi statis course. Ini jembatan antara RaceSolver (Tahap 2) dan
 *   skillValidityService (Tahap 1).
 */

'use strict';

const express = require('express');
const pool    = require('../db/pool');

const { solveRace, validateInput } = require('../simulation/RaceSolver');
// evaluateCondition diimplementasi lokal di bawah (evaluateConditionFromRows)
// supaya tidak perlu cross-boundary import ke folder etl/

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/simulate
// ---------------------------------------------------------------------------

/**
 * Body yang diharapkan:
 * {
 *   courseId: number,          // ID dari tabel racetrack_courses
 *   groundCondition: number,   // 1=firm, 2=good, 3=soft, 4=heavy
 *   uma: {
 *     speed: number,
 *     stamina: number,
 *     power: number,
 *     guts: number,
 *     wisdom: number,
 *     style: string,           // 'frontrunner' | 'pacechaser' | 'latesurger' | 'endcloser' | 'runaway'
 *     distanceApt: string,     // 'S'|'A'|...|'G'
 *     surfaceApt: string,      // 'S'|'A'|...|'G'
 *     moodLevel?: number       // 0-4, default 2
 *   }
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { courseId, groundCondition, uma } = req.body;

    if (!courseId || !Number.isInteger(Number(courseId))) {
      return res.status(400).json({ error: 'courseId wajib berupa integer' });
    }

    // Ambil data course dari DB (distance, ground, threshold stats)
    const [courseRows] = await pool.query(
      `SELECT
         c.id, c.distance, c.ground, c.tight_track,
         t.id AS racetrack_id, t.is_overseas
       FROM racetrack_courses c
       JOIN racetracks t ON t.id = c.racetrack_id
       WHERE c.id = ?`,
      [Number(courseId)]
    );

    if (courseRows.length === 0) {
      return res.status(404).json({ error: `Course ID ${courseId} tidak ditemukan` });
    }

    const dbCourse = courseRows[0];

    // thresholdStats belum ada di DB — kosongkan dulu
    const thresholdStats = [];

    // Bangun course input untuk RaceSolver
    const courseInput = {
      distance:       dbCourse.distance,
      ground:         dbCourse.ground,
      groundCondition: Number(groundCondition) || 1,
      thresholdStats,
      // slopes: [] — belum ada di DB schema, bisa ditambah nanti
    };

    // Bangun full input & validasi
    const raceInput = { course: courseInput, uma };

    try {
      validateInput(raceInput);
    } catch (validErr) {
      return res.status(400).json({ error: validErr.message });
    }

    // Jalankan simulasi
    const result = solveRace(raceInput);

    res.json({
      courseInfo: {
        id:           dbCourse.id,
        distance:     dbCourse.distance,
        ground:       dbCourse.ground,
        groundCondition: courseInput.groundCondition,
        thresholdStats,
        isTightTrack: dbCourse.tight_track,
        isOverseas:   dbCourse.is_overseas,
        racetckId:    dbCourse.racetrack_id,
      },
      simulation: result,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/simulate/skill-check
// ---------------------------------------------------------------------------

/**
 * Evaluasi skill di setiap section hasil simulasi.
 *
 * Body:
 * {
 *   skillId: number,
 *   simulation: object,    // hasil dari POST /api/simulate
 *   courseInfo: object     // dari respons yang sama
 * }
 *
 * Return: array hasil evaluasi per snapshot, dengan status:
 *   'active'   — semua kondisi terpenuhi di section ini
 *   'inactive' — ada kondisi yang gagal
 *   'unknown'  — ada variabel di luar scope MVP (mis. is_temptation)
 */
router.post('/skill-check', async (req, res, next) => {
  try {
    const { skillId, simulation, courseInfo } = req.body;

    if (!skillId || !simulation || !courseInfo) {
      return res.status(400).json({
        error: 'skillId, simulation, dan courseInfo wajib ada',
      });
    }

    // Ambil condition skill dari DB
    const [clauseRows] = await pool.query(
      `SELECT group_index, clause_index, variable_name, operator, term_value
       FROM skill_condition_clauses
       WHERE skill_id = ?
       ORDER BY group_index, clause_index, id`,
      [Number(skillId)]
    );

    if (clauseRows.length === 0) {
      // Cek apakah skill ada
      const [skillCheck] = await pool.query(
        'SELECT id, name_ja, name_en FROM skills WHERE id = ?',
        [Number(skillId)]
      );
      if (skillCheck.length === 0) {
        return res.status(404).json({ error: `Skill ID ${skillId} tidak ditemukan` });
      }
      // Skill ada tapi tidak punya kondisi → selalu aktif
      return res.json({
        skillId,
        hasConditions: false,
        note: 'Skill tidak punya kondisi aktivasi — selalu aktif',
        results: simulation.snapshots.map((snap) => ({
          sectionIndex: snap.sectionIndex,
          status: 'active',
        })),
      });
    }

    // Identifikasi variabel yang dipakai skill ini
    const allVariables = new Set(clauseRows.map((r) => r.variable_name));

    // Variabel yang kita BISA provide dari simulasi MVP
    const MVP_VARIABLES = new Set([
      'distance_rate', 'remain_distance', 'phase',
      'track_id', 'course_distance', 'distance_type', 'ground_type',
      'is_tight_track', 'is_abroad',
      // order_rate & bashin_diff: kita punya REGION, bukan nilai tunggal
      // → ditangani khusus di bawah
    ]);

    // Variabel yang DI LUAR scope — tandai unknown
    const OUT_OF_SCOPE = new Set([
      'is_temptation', 'change_order_onetime', 'overtake_target_time',
      'corner', 'is_lastspurt', // bisa kita hitung, tapi belum di clauseRows mapping
      'blocked_front', 'blocked_side', 'blocked_behind',
      'is_rushing', 'is_pace_down',
    ]);

    // Variabel posisi-relatif (ada region estimasi)
    const POSITIONAL_VARS = new Set([
      'order_rate', 'order',
      'bashin_diff_infront', 'bashin_diff_behind',
    ]);

    const hasUnknownVars = [...allVariables].some((v) => OUT_OF_SCOPE.has(v));
    const hasPositionalVars = [...allVariables].some((v) => POSITIONAL_VARS.has(v));

    // Bangun parsed clauses per group (manual, karena kita ambil dari DB bukan parse ulang)
    // Group struktur: { groupIndex -> { clauseIndex -> [terms] } }
    const groups = new Map();
    for (const row of clauseRows) {
      if (!groups.has(row.group_index)) groups.set(row.group_index, new Map());
      const clauses = groups.get(row.group_index);
      if (!clauses.has(row.clause_index)) clauses.set(row.clause_index, []);
      clauses.get(row.clause_index).push({
        variable: row.variable_name,
        operator: row.operator,
        value:    row.term_value,
      });
    }

    // Konversi ke format evaluateCondition: Array<Array<term>>
    function groupToParsedClauses(clauses) {
      return [...clauses.values()].map((terms) =>
        terms.map((t) => ({ variable: t.variable, operator: t.operator, value: t.value, raw: '' }))
      );
    }

    // Evaluasi tiap snapshot
    const results = simulation.snapshots.map((snap) => {
      // Context dasar dari simulasi
      const context = {
        distance_rate:    Math.round(snap.distance_rate * 100), // skill pakai 0-100
        remain_distance:  Math.round(snap.remain_distance),
        phase:            snap.phase,
        track_id:         courseInfo.racetckId,
        course_distance:  courseInfo.distance,
        ground_type:      courseInfo.ground,
        is_tight_track:   courseInfo.isTightTrack ? 1 : 0,
        is_abroad:        courseInfo.isOverseas ? 1 : 0,
        // distance_type (1-4) berdasarkan distance
        distance_type: courseInfo.distance <= 1400 ? 1
          : courseInfo.distance <= 1800 ? 2
          : courseInfo.distance <= 2400 ? 3 : 4,
      };

      // Cek apakah ada variabel out-of-scope
      if (hasUnknownVars) {
        return {
          sectionIndex: snap.sectionIndex,
          status: 'unknown',
          reason: 'Skill menggunakan variabel di luar scope MVP (mis. is_temptation)',
          unknownVars: [...allVariables].filter((v) => OUT_OF_SCOPE.has(v)),
        };
      }

      // Evaluasi per group (condition_1 DAN condition_2 harus lolos)
      let allGroupsPass = true;
      const groupResults = [];

      for (const [groupIdx, clauses] of groups) {
        const parsedClauses = groupToParsedClauses(clauses);

        // Untuk variabel positional, evaluasi dengan region
        // Skill valid kalau ada overlap antara region estimasi & nilai di kondisi
        let groupStatus = 'active';

        if (hasPositionalVars) {
          // Tambahkan nilai tengah region ke context sebagai estimasi
          const { min: orMin, max: orMax } = snap.orderRateRegion;
          const orMid = Math.round((orMin + orMax) / 2);
          context.order_rate = orMid;
          context.order = Math.round(orMid / 10); // kasar: 1-9

          const bashin = snap.bashinDiffRegion;
          context.bashin_diff_infront = Math.round((bashin.infront.min + bashin.infront.max) / 2);
          context.bashin_diff_behind  = Math.round((bashin.behind.min  + bashin.behind.max) / 2);
        }

        // Strict mode: variabel yang tidak ada di context → gagal
        // Kecuali variabel positional yang kita sudah inject di atas
        const passes = evaluateConditionFromRows(parsedClauses, context, { strict: false });

        groupResults.push({ groupIndex: groupIdx, passes });
        if (!passes) allGroupsPass = false;
      }

      const status = allGroupsPass ? 'active' : 'inactive';

      return {
        sectionIndex:       snap.sectionIndex,
        status,
        distance_rate:      snap.distance_rate,
        phase:              snap.phase,
        isPositionalEstimate: hasPositionalVars,
        groupResults,
      };
    });

    res.json({
      skillId,
      hasConditions:        true,
      variablesUsed:        [...allVariables],
      hasUnknownVars,
      hasPositionalVars,
      results,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helper lokal: evaluasi parsed clauses tanpa import conditionParser
// (hindari masalah relative path — logic sama persis)
// ---------------------------------------------------------------------------
function evaluateConditionFromRows(parsedClauses, context, { strict = false } = {}) {
  if (!parsedClauses || parsedClauses.length === 0) return true;

  return parsedClauses.some((clause) =>
    clause.every((term) => {
      if (!(term.variable in context)) {
        return !strict;
      }
      const actual = context[term.variable];
      switch (term.operator) {
        case '==': return actual === term.value;
        case '!=': return actual !== term.value;
        case '>=': return actual >= term.value;
        case '<=': return actual <= term.value;
        case '>':  return actual >  term.value;
        case '<':  return actual <  term.value;
        default:   return false;
      }
    })
  );
}

module.exports = router;