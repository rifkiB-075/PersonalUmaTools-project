/**
 * services/skillValidityService.js
 *
 * TAHAP 1: Filter skill yang VALID di sebuah racetrack_course tertentu.
 *
 * Caranya: ambil semua variabel STATIS (terikat ke track/course) dari
 * skill_condition_clauses, lalu cek apakah ada term yang "match" course
 * yang dipilih. Skill dianggap "mungkin aktif" (possiblyValid) kalau:
 *
 *   - Skill TIDAK punya clause manapun yang menyebut variabel statis sama
 *     sekali (artinya tidak terikat track tertentu, valid di mana saja
 *     selama variabel runtime-nya terpenuhi nanti), ATAU
 *   - Skill PUNYA clause yang variabel statisnya cocok dengan course ini
 *     (ingat: OR antar clause, AND dalam clause -- jadi kalau salah satu
 *     clause variabel statisnya match/tidak disebut, clause itu "lolos"
 *     tahap 1)
 *
 * Variabel statis yang ditangani: track_id, course_distance, distance_type,
 * ground_type. (is_abroad & is_tight_track bisa ditambah belakangan kalau
 * datanya sudah dipetakan di racetrack_courses.)
 *
 * Skill yang clause-nya punya term statis yang KONTRADIKTIF dengan course
 * (mis. track_id==10005 tapi course yang dipilih track_id 10006) dianggap
 * TIDAK valid (mustahil aktif di course ini).
 */

'use strict';

const pool = require('../db/pool');

// Variabel yang dianggap "statis terhadap track/course" di Tahap 1.
// Variabel lain (distance_rate, order_rate, phase, dst) diabaikan dulu
// karena itu state runtime race, bukan properti track.
const STATIC_TRACK_VARIABLES = new Set([
  'track_id',
  'course_distance',
  'distance_type',
  'ground_type',
]);

const DISTANCE_TYPE_MAP = {
  // Berdasarkan cross-check empiris dari master.mdb:
  // distance_type==4 ditemukan berbarengan dengan course_distance>=2400-3000 (Long)
  short: 1, // <=1400m
  mile: 2, // 1401-1800m
  middle: 3, // 1801-2400m
  long: 4, // >2400m
};

function evaluateTerm(operator, termValue, actualValue) {
  switch (operator) {
    case '==':
      return actualValue === termValue;
    case '!=':
      return actualValue !== termValue;
    case '>=':
      return actualValue >= termValue;
    case '<=':
      return actualValue <= termValue;
    case '>':
      return actualValue > termValue;
    case '<':
      return actualValue < termValue;
    default:
      throw new Error(`Operator tidak dikenal: ${operator}`);
  }
}

/**
 * Hitung distance_type dari nilai distance (meter), konsisten dengan
 * mapping yang sudah dikonfirmasi dari master.mdb.
 */
function getDistanceType(distanceMeters) {
  if (distanceMeters <= 1400) return DISTANCE_TYPE_MAP.short;
  if (distanceMeters <= 1800) return DISTANCE_TYPE_MAP.mile;
  if (distanceMeters <= 2400) return DISTANCE_TYPE_MAP.middle;
  return DISTANCE_TYPE_MAP.long;
}

/**
 * Ambil detail course (racetrack_id, distance, ground) lalu hitung
 * context statis yang dipakai untuk evaluasi.
 */
async function getCourseContext(courseId) {
  const [rows] = await pool.query(
    `SELECT id, racetrack_id, distance, ground FROM racetrack_courses WHERE id = ?`,
    [courseId]
  );

  if (rows.length === 0) {
    return null;
  }

  const course = rows[0];
  return {
    track_id: course.racetrack_id,
    course_distance: course.distance,
    distance_type: getDistanceType(course.distance),
    ground_type: course.ground, // 1=turf, 2=dirt, sudah sama persis dengan skema game
  };
}

/**
 * Evaluasi satu clause (array of term) terhadap context statis.
 * Term dengan variable di luar STATIC_TRACK_VARIABLES dianggap "lolos"
 * (tidak membatalkan clause), karena belum bisa dievaluasi di Tahap 1.
 *
 * @returns {boolean} true kalau clause ini "possibly valid" untuk course ini
 */
function evaluateClauseStatic(terms, context) {
  return terms.every((term) => {
    if (!STATIC_TRACK_VARIABLES.has(term.variable_name)) {
      return true; // variabel runtime, belum bisa dicek -> anggap lolos
    }
    return evaluateTerm(term.operator, term.term_value, context[term.variable_name]);
  });
}

/**
 * Endpoint utama: ambil semua skill beserta status validitasnya untuk
 * sebuah course tertentu.
 *
 * @param {number} courseId
 * @returns {Promise<{course: object, skills: Array<{id, name_ja, isValid: boolean, matchedOnTrackSpecific: boolean}>}>}
 */
async function getValidSkillsForCourse(courseId) {
  const context = await getCourseContext(courseId);
  if (!context) {
    return null;
  }

  // Ambil semua skill beserta clause-nya sekaligus (1 query, di-group di JS)
  // supaya tidak N+1 query untuk 2000+ skill.
  const [rows] = await pool.query(
    `
    SELECT
      s.id AS skill_id,
      s.name_ja,
      s.name_en,
      s.rarity,
      s.icon_id,
      c.group_index,
      c.clause_index,
      c.variable_name,
      c.operator,
      c.term_value
    FROM skills s
    LEFT JOIN skill_condition_clauses c ON c.skill_id = s.id
    ORDER BY s.id, c.group_index, c.clause_index;
    `
  );

  // Group rows jadi per-skill -> per-group_index -> per-clause_index -> [terms]
  const skillMap = new Map();

  for (const row of rows) {
    if (!skillMap.has(row.skill_id)) {
      skillMap.set(row.skill_id, {
        id: row.skill_id,
        name_ja: row.name_ja,
        name_en: row.name_en,
        rarity: row.rarity,
        icon_id: row.icon_id,
        groups: new Map(), // group_index -> Map(clause_index -> [terms])
      });
    }

    if (row.variable_name === null) {
      continue; // skill tanpa clause sama sekali (condition_1/2 kosong)
    }

    const skill = skillMap.get(row.skill_id);
    if (!skill.groups.has(row.group_index)) {
      skill.groups.set(row.group_index, new Map());
    }
    const clauses = skill.groups.get(row.group_index);
    if (!clauses.has(row.clause_index)) {
      clauses.set(row.clause_index, []);
    }
    clauses.get(row.clause_index).push({
      variable_name: row.variable_name,
      operator: row.operator,
      term_value: row.term_value,
    });
  }

  // Evaluasi tiap skill: possibly valid kalau SALAH SATU dari condition_1
  // ATAU condition_2 possibly valid (karena keduanya adalah efek terpisah;
  // skill dianggap "bisa aktif di course ini" kalau ada minimal satu efek
  // yang bisa trigger).
  const results = [];

  for (const skill of skillMap.values()) {
    let isValid = true; // default true kalau skill tidak punya clause statis sama sekali
    let hasAnyGroup = skill.groups.size > 0;
    let hasTrackSpecificTerm = false;

    if (hasAnyGroup) {
      // skill valid kalau ADA minimal satu group (condition_1 ATAU condition_2)
      // yang possibly valid
      isValid = false;
      for (const clauses of skill.groups.values()) {
        // dalam satu group, clause di-OR-kan (cukup salah satu clause match)
        let groupValid = false;
        for (const terms of clauses.values()) {
          if (evaluateClauseStatic(terms, context)) {
            groupValid = true;
          }
          if (terms.some((t) => STATIC_TRACK_VARIABLES.has(t.variable_name))) {
            hasTrackSpecificTerm = true;
          }
        }
        if (groupValid) {
          isValid = true;
        }
      }
    }

    results.push({
      id: skill.id,
      name_ja: skill.name_ja,
      name_en: skill.name_en,
      rarity: skill.rarity,
      icon_id: skill.icon_id,
      isValid,
      isTrackSpecific: hasTrackSpecificTerm,
    });
  }

  return {
    course: {
      id: courseId,
      ...context,
    },
    skills: results,
  };
}

module.exports = {
  getValidSkillsForCourse,
  getDistanceType,
  STATIC_TRACK_VARIABLES,
};
