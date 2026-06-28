'use strict';

const pool = require('../db/pool');

const STATIC_TRACK_VARIABLES = new Set([
  'track_id',
  'course_distance',
  'distance_type',
  'ground_type',
  'is_tight_track',
  'is_abroad',
]);

const DISTANCE_TYPE_MAP = {
  short: 1,
  mile: 2,
  middle: 3,
  long: 4,
};

function evaluateTerm(operator, termValue, actualValue) {
  switch (operator) {
    case '==': return actualValue === termValue;
    case '!=': return actualValue !== termValue;
    case '>=': return actualValue >= termValue;
    case '<=': return actualValue <= termValue;
    case '>':  return actualValue >  termValue;
    case '<':  return actualValue <  termValue;
    default: throw new Error(`Operator tidak dikenal: ${operator}`);
  }
}

function getDistanceType(distanceMeters) {
  if (distanceMeters <= 1400) return DISTANCE_TYPE_MAP.short;
  if (distanceMeters <= 1800) return DISTANCE_TYPE_MAP.mile;
  if (distanceMeters <= 2400) return DISTANCE_TYPE_MAP.middle;
  return DISTANCE_TYPE_MAP.long;
}

async function getCourseContext(courseId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.racetrack_id, c.distance, c.ground, c.tight_track, t.is_overseas
     FROM racetrack_courses c
     JOIN racetracks t ON t.id = c.racetrack_id
     WHERE c.id = ?`,
    [courseId]
  );
  if (rows.length === 0) return null;
  const course = rows[0];
  return {
    track_id: course.racetrack_id,
    course_distance: course.distance,
    distance_type: getDistanceType(course.distance),
    ground_type: course.ground,
    is_tight_track: course.tight_track,
    is_abroad: course.is_overseas,
  };
}

function evaluateClauseStatic(terms, context) {
  return terms.every((term) => {
    if (!STATIC_TRACK_VARIABLES.has(term.variable_name)) return true;
    return evaluateTerm(term.operator, term.term_value, context[term.variable_name]);
  });
}

async function getValidSkillsForCourse(courseId) {
  const context = await getCourseContext(courseId);
  if (!context) return null;

  const [rows] = await pool.query(
    `SELECT
       s.id AS skill_id, s.name_ja, s.name_en, s.rarity,
       s.skill_category, s.icon_id,
       c.group_index, c.clause_index, c.variable_name, c.operator, c.term_value
     FROM skills s
     LEFT JOIN skill_condition_clauses c ON c.skill_id = s.id
     ORDER BY s.id, c.group_index, c.clause_index`
  );

  const skillMap = new Map();
  for (const row of rows) {
    if (!skillMap.has(row.skill_id)) {
      skillMap.set(row.skill_id, {
        id: row.skill_id,
        name_ja: row.name_ja,
        name_en: row.name_en,
        rarity: row.rarity,
        skill_category: row.skill_category,
        icon_id: row.icon_id,
        groups: new Map(),
      });
    }
    if (row.variable_name === null) continue;
    const skill = skillMap.get(row.skill_id);
    if (!skill.groups.has(row.group_index)) skill.groups.set(row.group_index, new Map());
    const clauses = skill.groups.get(row.group_index);
    if (!clauses.has(row.clause_index)) clauses.set(row.clause_index, []);
    clauses.get(row.clause_index).push({
      variable_name: row.variable_name,
      operator: row.operator,
      term_value: row.term_value,
    });
  }

  const results = [];
  for (const skill of skillMap.values()) {
    let isValid = true;
    let hasTrackSpecificTerm = false;
    const hasAnyGroup = skill.groups.size > 0;

    if (hasAnyGroup) {
      isValid = false;
      for (const clauses of skill.groups.values()) {
        let groupValid = false;
        for (const terms of clauses.values()) {
          if (evaluateClauseStatic(terms, context)) groupValid = true;
          if (terms.some((t) => STATIC_TRACK_VARIABLES.has(t.variable_name))) hasTrackSpecificTerm = true;
        }
        if (groupValid) isValid = true;
      }
    }

    results.push({
      id: skill.id,
      name_ja: skill.name_ja,
      name_en: skill.name_en,
      rarity: skill.rarity,
      skill_category: skill.skill_category,
      icon_id: skill.icon_id,
      isValid,
      isTrackSpecific: hasTrackSpecificTerm,
    });
  }

  return {
    course: { id: courseId, ...context },
    skills: results,
  };
}

module.exports = { getValidSkillsForCourse, getDistanceType, STATIC_TRACK_VARIABLES };