/**
 * routes/uma.js
 *
 * POST /api/uma/analyze
 *
 * Endpoint terintegrasi: terima data uma + course + daftar skill yang dimiliki,
 * lalu return hasil analisis tiap skill (kapan aktif) + rekomendasi terbaik.
 *
 * Flow internal:
 *   1. Ambil data course dari DB
 *   2. Jalankan simulasi fisika (RaceSolver) untuk dapat snapshot per section
 *   3. Untuk tiap skill yang dikirim:
 *      a. Filter statis (Tahap 1): apakah skill possibly valid di course ini?
 *      b. Evaluasi runtime per snapshot (Tahap 2): di section mana skill aktif?
 *   4. Hitung skor rekomendasi per skill, return terurut dari terbaik
 *
 * Request body:
 * {
 *   courseId: number,
 *   groundCondition: number,      // 1=firm 2=good 3=soft 4=heavy, default 1
 *   uma: {
 *     speed: number,
 *     stamina: number,
 *     power: number,
 *     guts: number,
 *     wisdom: number,
 *     style: string,              // 'frontrunner'|'pacechaser'|'latesurger'|'endcloser'|'runaway'
 *     distanceApt: string,        // 'S'|'A'|'B'|'C'|'D'|'E'|'F'|'G'
 *     surfaceApt: string,
 *     moodLevel?: number          // 0-4, default 2
 *   },
 *   skillIds: number[]            // daftar ID skill yang dimiliki uma
 * }
 *
 * Response:
 * {
 *   courseInfo: { id, distance, ground, groundCondition, ... },
 *   skills: [
 *     {
 *       id, name_ja, name_en, rarity,
 *       isValidForCourse: boolean,       // lolos filter statis Tahap 1
 *       activeSections: number[],        // sectionIndex di mana skill aktif
 *       activePhases: number[],          // phase (0-3) di mana skill aktif
 *       activationRate: number,          // 0-1, fraksi section yang aktif
 *       earliestActivation: number|null, // distance_rate pertama kali aktif
 *       score: number,                   // skor rekomendasi (makin besar makin baik)
 *       scoreBreakdown: object,
 *       status: 'active'|'conditional'|'invalid'|'unknown',
 *       note: string
 *     },
 *     ...
 *   ],
 *   recommendations: number[],     // skillIds terurut dari terbaik (top 10)
 *   simulationMeta: { totalSections, phases }
 * }
 */

'use strict';

const express = require('express');
const pool = require('../db/pool');
const { solveRace, validateInput } = require('../simulation/RaceSolver');

const router = express.Router();

// ---------------------------------------------------------------------------
// Konstanta evaluasi
// ---------------------------------------------------------------------------

// Variabel yang kita TIDAK bisa evaluate (out of scope MVP)
const OUT_OF_SCOPE_VARS = new Set([
  'is_temptation', 'change_order_onetime', 'overtake_target_time',
  'blocked_front', 'blocked_side', 'blocked_behind',
  'is_rushing', 'is_pace_down', 'is_dirtgrade',
]);

// Variabel statis (terikat course, bukan berubah per section)
const STATIC_VARS = new Set([
  'track_id', 'course_distance', 'distance_type',
  'ground_type', 'is_tight_track', 'is_abroad',
]);

// ---------------------------------------------------------------------------
// Helper: evaluasi satu clause (array of terms) — OR antar clause, AND dalam clause
// ---------------------------------------------------------------------------
function evalClause(terms, context) {
  return terms.every(term => {
    if (!(term.variable in context)) return true; // unknown var → tidak blokir
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
  });
}

// Evaluasi semua groups (condition_1 dan condition_2 dari DB):
// semua group harus lolos (AND antar group).
// Di dalam setiap group, clause di-OR.
function evalAllGroups(groups, context) {
  for (const clauses of groups.values()) {
    // Cek apakah ada minimal satu clause yang lolos di group ini
    let groupPasses = false;
    for (const terms of clauses.values()) {
      if (evalClause(terms, context)) { groupPasses = true; break; }
    }
    if (!groupPasses) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helper: build context dari snapshot + courseInfo
// ---------------------------------------------------------------------------
function buildContext(snap, courseInfo) {
  const distanceRate100 = Math.round(snap.distance_rate * 100);
  const { min: orMin, max: orMax } = snap.orderRateRegion;
  const orMid = Math.round((orMin + orMax) / 2);

  const bashin = snap.bashinDiffRegion;
  const bInfront = Math.round((bashin.infront.min + bashin.infront.max) / 2);
  const bBehind  = Math.round((bashin.behind.min  + bashin.behind.max) / 2);

  return {
    // Runtime
    distance_rate:        distanceRate100,
    remain_distance:      Math.round(snap.remain_distance),
    phase:                snap.phase,
    order_rate:           orMid,
    order:                Math.round(orMid / 10),
    bashin_diff_infront:  bInfront,
    bashin_diff_behind:   bBehind,
    // Statis course
    track_id:             courseInfo.racetackId,
    course_distance:      courseInfo.distance,
    ground_type:          courseInfo.ground,
    distance_type:        courseInfo.distanceType,
    is_tight_track:       courseInfo.isTightTrack ? 1 : 0,
    is_abroad:            courseInfo.isOverseas ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Helper: skor rekomendasi skill
//
// Kriteria (makin besar = lebih direkomendasikan):
//   - activationRate tinggi (skill sering aktif)
//   - aktif di phase 2/3 (late race / last spurt) → lebih impactful
//   - aktif lebih awal (lebih banyak kesempatan trigger)
//   - rarity lebih tinggi (skill rare biasanya efeknya lebih kuat)
// ---------------------------------------------------------------------------
function calcScore(activeSections, snapshots, rarity, isValidForCourse) {
  if (!isValidForCourse || activeSections.length === 0) return 0;

  const total = snapshots.length;
  const activationRate = activeSections.length / total;

  // Bobot phase: 0=early(0.5), 1=mid(0.8), 2=late(1.2), 3=lastspurt(1.5)
  const PHASE_WEIGHT = [0.5, 0.8, 1.2, 1.5];
  const phaseBonus = activeSections.reduce((acc, idx) => {
    const snap = snapshots[idx];
    return acc + (PHASE_WEIGHT[snap.phase] ?? 1.0);
  }, 0) / activeSections.length;

  // Bonus skill rare (rarity 1=normal, 2=gold, 3=unique)
  const rarityBonus = (rarity || 1) * 0.15;

  // Penalti jika aktif terlambat (>= 80% race sudah lewat)
  const earlyBonus = activeSections.some(idx => snapshots[idx].distance_rate < 0.5) ? 0.2 : 0;

  const score = activationRate * phaseBonus * (1 + rarityBonus + earlyBonus);
  return Math.round(score * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// POST /api/uma/analyze
// ---------------------------------------------------------------------------
router.post('/analyze', async (req, res, next) => {
  try {
    const { courseId, groundCondition, uma, skillIds } = req.body;

    // ── Validasi input ──
    if (!courseId || !Number.isInteger(Number(courseId))) {
      return res.status(400).json({ error: 'courseId wajib berupa integer' });
    }
    if (!Array.isArray(skillIds) || skillIds.length === 0) {
      return res.status(400).json({ error: 'skillIds wajib berupa array tidak kosong' });
    }
    if (skillIds.length > 300) {
      return res.status(400).json({ error: 'Maksimal 300 skill per request' });
    }
    if (!uma || typeof uma !== 'object') {
      return res.status(400).json({ error: 'Data uma wajib ada' });
    }

    // ── 1. Ambil data course ──
    const [courseRows] = await pool.query(
      `SELECT c.id, c.distance, c.ground, c.tight_track,
              c.distance_category,
              t.id AS racetrack_id, t.name_ja AS track_name_ja,
              t.name_en AS track_name_en, t.is_overseas
       FROM racetrack_courses c
       JOIN racetracks t ON t.id = c.racetrack_id
       WHERE c.id = ?`,
      [Number(courseId)]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({ error: `Course ID ${courseId} tidak ditemukan` });
    }
    const dbCourse = courseRows[0];

    const distanceTypeMap = { short: 1, mile: 2, middle: 3, long: 4 };
    const courseInfo = {
      id:             dbCourse.id,
      distance:       dbCourse.distance,
      ground:         dbCourse.ground,
      groundCondition: Number(groundCondition) || 1,
      isTightTrack:   !!dbCourse.tight_track,
      isOverseas:     !!dbCourse.is_overseas,
      racetackId:     dbCourse.racetrack_id,
      trackNameJa:    dbCourse.track_name_ja,
      trackNameEn:    dbCourse.track_name_en,
      distanceCategory: dbCourse.distance_category,
      distanceType:   distanceTypeMap[dbCourse.distance_category] ?? 3,
    };

    // ── 2. Jalankan simulasi ──
    const raceInput = {
      course: {
        distance:        courseInfo.distance,
        ground:          courseInfo.ground,
        groundCondition: courseInfo.groundCondition,
        thresholdStats:  [],
      },
      uma,
    };
    try { validateInput(raceInput); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const simulation = solveRace(raceInput);
    const { snapshots } = simulation;

    // ── 3. Ambil data semua skill yang diminta (1 query) ──
    const placeholders = skillIds.map(() => '?').join(',');
    const [skillBaseRows] = await pool.query(
      `SELECT id, name_ja, name_en, rarity, description_en
       FROM skills WHERE id IN (${placeholders})`,
      skillIds.map(Number)
    );
    const skillBaseMap = new Map(skillBaseRows.map(s => [s.id, s]));

    // ── 4. Ambil condition clauses untuk semua skill (1 query) ──
    const [clauseRows] = await pool.query(
      `SELECT skill_id, group_index, clause_index, variable_name, operator, term_value
       FROM skill_condition_clauses
       WHERE skill_id IN (${placeholders})
       ORDER BY skill_id, group_index, clause_index, id`,
      skillIds.map(Number)
    );

    // Group clauses per skill → group → clause → [terms]
    const skillClauseMap = new Map(); // skill_id → Map(group_index → Map(clause_index → [terms]))
    for (const row of clauseRows) {
      if (!skillClauseMap.has(row.skill_id)) skillClauseMap.set(row.skill_id, new Map());
      const groups = skillClauseMap.get(row.skill_id);
      if (!groups.has(row.group_index)) groups.set(row.group_index, new Map());
      const clauses = groups.get(row.group_index);
      if (!clauses.has(row.clause_index)) clauses.set(row.clause_index, []);
      clauses.get(row.clause_index).push({
        variable: row.variable_name,
        operator: row.operator,
        value:    row.term_value,
      });
    }

    // ── 5. Evaluasi tiap skill ──
    const skillResults = [];

    for (const rawId of skillIds) {
      const skillId = Number(rawId);
      const base = skillBaseMap.get(skillId);

      // Skill tidak ditemukan di DB
      if (!base) {
        skillResults.push({
          id: skillId,
          name_ja: null, name_en: null, rarity: null,
          isValidForCourse: false,
          activeSections: [], activePhases: [],
          activationRate: 0, earliestActivation: null,
          score: 0,
          status: 'not_found',
          note: `Skill ID ${skillId} tidak ada di database`,
        });
        continue;
      }

      const groups = skillClauseMap.get(skillId); // bisa undefined (skill tanpa kondisi)

      // Kumpulkan semua variabel yang dipakai skill ini
      const allVars = new Set();
      if (groups) {
        for (const clauses of groups.values())
          for (const terms of clauses.values())
            for (const t of terms) allVars.add(t.variable);
      }

      // Cek apakah ada variabel out-of-scope
      const outOfScopeUsed = [...allVars].filter(v => OUT_OF_SCOPE_VARS.has(v));
      if (outOfScopeUsed.length > 0) {
        skillResults.push({
          id: skillId,
          name_ja: base.name_ja, name_en: base.name_en, rarity: base.rarity,
          isValidForCourse: false,
          activeSections: [], activePhases: [],
          activationRate: 0, earliestActivation: null,
          score: 0,
          status: 'unknown',
          note: `Menggunakan variabel di luar scope simulasi: ${outOfScopeUsed.join(', ')}`,
          outOfScopeVars: outOfScopeUsed,
        });
        continue;
      }

      // Skill tanpa kondisi sama sekali → selalu aktif
      if (!groups || groups.size === 0) {
        const activeSections = snapshots.map(s => s.sectionIndex);
        const activePhases   = [...new Set(snapshots.map(s => s.phase))].sort();
        const score = calcScore(activeSections, snapshots, base.rarity, true);
        skillResults.push({
          id: skillId,
          name_ja: base.name_ja, name_en: base.name_en, rarity: base.rarity,
          isValidForCourse: true,
          activeSections,
          activePhases,
          activationRate: 1,
          earliestActivation: snapshots[0]?.distance_rate ?? null,
          score,
          scoreBreakdown: { activationRate: 1, phaseBonus: 'n/a', rarityBonus: base.rarity * 0.15 },
          status: 'active',
          note: 'Tidak punya kondisi aktivasi — selalu aktif',
        });
        continue;
      }

      // ── Evaluasi per snapshot ──
      const activeSections = [];
      const activePhasesSet = new Set();

      for (const snap of snapshots) {
        const context = buildContext(snap, courseInfo);
        const passes  = evalAllGroups(groups, context);
        if (passes) {
          activeSections.push(snap.sectionIndex);
          activePhasesSet.add(snap.phase);
        }
      }

      const activePhases = [...activePhasesSet].sort();
      const activationRate = activeSections.length / snapshots.length;
      const earliestSnap = activeSections.length > 0
        ? snapshots[activeSections[0]] : null;

      // Cek validitas statis (track_id, distance_type, dll)
      const hasStaticTerm = [...allVars].some(v => STATIC_VARS.has(v));
      const isValidForCourse = activeSections.length > 0 || !hasStaticTerm;

      const score = calcScore(activeSections, snapshots, base.rarity, isValidForCourse);

      let status, note;
      if (activeSections.length === 0 && hasStaticTerm) {
        status = 'invalid';
        note   = 'Kondisi statis (track/jarak/permukaan) tidak cocok dengan course ini';
      } else if (activeSections.length === 0) {
        status = 'conditional';
        note   = 'Kondisi runtime tidak terpenuhi di section manapun berdasarkan estimasi';
      } else if (activationRate >= 0.5) {
        status = 'active';
        note   = `Aktif di ${activeSections.length} dari ${snapshots.length} section`;
      } else {
        status = 'conditional';
        note   = `Aktif terbatas di ${activeSections.length} section (${Math.round(activationRate * 100)}%)`;
      }

      skillResults.push({
        id: skillId,
        name_ja: base.name_ja,
        name_en: base.name_en,
        rarity: base.rarity,
        isValidForCourse,
        activeSections,
        activePhases,
        activationRate: Math.round(activationRate * 1000) / 1000,
        earliestActivation: earliestSnap ? Math.round(earliestSnap.distance_rate * 100) / 100 : null,
        score,
        status,
        note,
      });
    }

    // ── 6. Ranking rekomendasi ──
    const recommendations = [...skillResults]
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(s => s.id);

    // ── 7. Sortir hasil output: invalid paling bawah ──
    const STATUS_ORDER = { active: 0, conditional: 1, unknown: 2, invalid: 3, not_found: 4 };
    skillResults.sort((a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.score - a.score
    );

    res.json({
      courseInfo: {
        id:               courseInfo.id,
        distance:         courseInfo.distance,
        ground:           courseInfo.ground,
        groundCondition:  courseInfo.groundCondition,
        distanceCategory: courseInfo.distanceCategory,
        isTightTrack:     courseInfo.isTightTrack,
        isOverseas:       courseInfo.isOverseas,
        trackNameJa:      courseInfo.trackNameJa,
        trackNameEn:      courseInfo.trackNameEn,
      },
      skills: skillResults,
      recommendations,
      simulationMeta: {
        totalSections: snapshots.length,
        phases: [
          { phase: 0, label: 'Early Race',  sections: snapshots.filter(s => s.phase === 0).length },
          { phase: 1, label: 'Mid Race',    sections: snapshots.filter(s => s.phase === 1).length },
          { phase: 2, label: 'Late Race',   sections: snapshots.filter(s => s.phase === 2).length },
          { phase: 3, label: 'Last Spurt',  sections: snapshots.filter(s => s.phase === 3).length },
        ],
      },
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;