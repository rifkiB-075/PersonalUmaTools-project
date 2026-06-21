/**
 * extract.js
 * Baca data dari master.mdb (SQLite) dan kembalikan sebagai array objek JS
 * yang sudah di-join dengan text_data (nama JA), siap untuk di-load ke MySQL.
 */

'use strict';

const Database = require('better-sqlite3');

/**
 * @param {string} mdbPath - path ke file master.mdb
 * @returns {{
 *   racetracks: Array<object>,
 *   racetrackCourses: Array<object>,
 *   skills: Array<object>,
 * }}
 */
function extractFromMasterMdb(mdbPath) {
  // readonly: true -> tidak akan menulis/mengubah file game sama sekali
  const db = new Database(mdbPath, { readonly: true, fileMustExist: true });

  try {
    const racetracks = extractRacetracks(db);
    const racetrackCourses = extractRacetrackCourses(db);
    const skills = extractSkills(db);

    return { racetracks, racetrackCourses, skills };
  } finally {
    db.close();
  }
}

function extractRacetracks(db) {
  // category 35 = nama singkat (mis. "東京")
  // category 31 = nama lengkap (mis. "東京レース場")
  const rows = db
    .prepare(
      `
      SELECT
        rt.id,
        rt.area,
        short_name.text AS name_ja,
        full_name.text  AS name_ja_full
      FROM race_track rt
      LEFT JOIN text_data short_name
        ON short_name."index" = rt.id AND short_name.category = 35
      LEFT JOIN text_data full_name
        ON full_name."index" = rt.id AND full_name.category = 31
      ORDER BY rt.id;
      `
    )
    .all();

  // Track luar negeri (id 10201-10203 dst, area code beda) ditandai manual.
  // Berdasarkan data: 10201=Longchamp, 10202=Santa Anita, 10203=Del Mar -> overseas
  const OVERSEAS_IDS = new Set([10201, 10202, 10203]);

  return rows.map((r) => ({
    id: r.id,
    area: r.area,
    name_ja: r.name_ja,
    name_ja_full: r.name_ja_full,
    is_overseas: OVERSEAS_IDS.has(r.id) ? 1 : 0,
  }));
}

function extractRacetrackCourses(db) {
  const rows = db
    .prepare(
      `
      SELECT id, race_track_id, distance, ground, inout AS course_inout, turn
      FROM race_course_set
      ORDER BY race_track_id, distance;
      `
    )
    .all();

  return rows.map((r) => ({
    id: r.id,
    racetrack_id: r.race_track_id,
    distance: r.distance,
    ground: r.ground, // 1=turf, 2=dirt
    course_inout: r.course_inout,
    turn: r.turn,
  }));
}

function extractSkills(db) {
  const rows = db
    .prepare(
      `
      SELECT
        s.id,
        s.rarity,
        s.skill_category,
        s.icon_id,
        s.precondition_1,
        s.condition_1,
        s.precondition_2,
        s.condition_2,
        s.is_general_skill,
        s.start_date,
        s.end_date,
        name_t.text AS name_ja,
        desc_t.text AS description_ja
      FROM skill_data s
      LEFT JOIN text_data name_t ON name_t."index" = s.id AND name_t.category = 47
      LEFT JOIN text_data desc_t ON desc_t."index" = s.id AND desc_t.category = 48
      ORDER BY s.id;
      `
    )
    .all();

  return rows.map((r) => ({
    id: r.id,
    rarity: r.rarity,
    skill_category: r.skill_category,
    icon_id: r.icon_id,
    name_ja: r.name_ja,
    description_ja: r.description_ja,
    precondition_1: r.precondition_1,
    condition_1: r.condition_1,
    precondition_2: r.precondition_2,
    condition_2: r.condition_2,
    is_general_skill: r.is_general_skill,
    start_date: r.start_date,
    end_date: r.end_date,
  }));
}

module.exports = { extractFromMasterMdb };
