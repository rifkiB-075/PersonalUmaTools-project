/**
 * load.js
 * Load data hasil extract + transform ke MySQL/MariaDB.
 * Menggunakan transaction supaya kalau ada error di tengah jalan,
 * tidak ada data setengah-jadi yang nyangkut di database.
 */

'use strict';

const BATCH_SIZE = 500; // insert per-batch supaya tidak melebihi max_allowed_packet

async function loadToMysql(pool, { racetracks, racetrackCourses, skills, clauseRows }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Urutan insert PENTING karena ada foreign key:
    // racetracks -> racetrack_courses -> skills -> skill_condition_clauses

    await truncateAll(conn);
    await insertRacetracks(conn, racetracks);
    await insertRacetrackCourses(conn, racetrackCourses);
    await insertSkills(conn, skills);
    await insertClauseRows(conn, clauseRows);

    await conn.commit();
    console.log('✓ Semua data berhasil di-load ke MySQL (transaction committed).');
  } catch (err) {
    await conn.rollback();
    console.error('✗ Gagal load data, transaction di-rollback. Tidak ada data yang berubah.');
    throw err;
  } finally {
    conn.release();
  }
}

async function truncateAll(conn) {
  // Matikan FK check sementara supaya urutan truncate tidak masalah
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('TRUNCATE TABLE skill_condition_clauses');
  await conn.query('TRUNCATE TABLE skill_track_validity_cache');
  await conn.query('TRUNCATE TABLE skills');
  await conn.query('TRUNCATE TABLE racetrack_courses');
  await conn.query('TRUNCATE TABLE racetracks');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function insertRacetracks(conn, rows) {
  if (rows.length === 0) return;
  const sql = `
    INSERT INTO racetracks (id, name_ja, name_ja_full, area, is_overseas)
    VALUES ?
  `;
  const values = rows.map((r) => [r.id, r.name_ja, r.name_ja_full, r.area, r.is_overseas]);
  await conn.query(sql, [values]);
  console.log(`  - racetracks: ${rows.length} baris`);
}

async function insertRacetrackCourses(conn, rows) {
  if (rows.length === 0) return;
  const sql = `
    INSERT INTO racetrack_courses (id, racetrack_id, distance, ground, course_inout, turn)
    VALUES ?
  `;
  const values = rows.map((r) => [r.id, r.racetrack_id, r.distance, r.ground, r.course_inout, r.turn]);
  await conn.query(sql, [values]);
  console.log(`  - racetrack_courses: ${rows.length} baris`);
}

async function insertSkills(conn, rows) {
  if (rows.length === 0) return;
  const sql = `
    INSERT INTO skills (
      id, rarity, skill_category, name_ja, description_ja, icon_id,
      precondition_1, condition_1, precondition_2, condition_2,
      is_general_skill, start_date, end_date
    ) VALUES ?
  `;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((r) => [
      r.id,
      r.rarity,
      r.skill_category,
      r.name_ja,
      r.description_ja,
      r.icon_id,
      r.precondition_1,
      r.condition_1,
      r.precondition_2,
      r.condition_2,
      r.is_general_skill,
      r.start_date,
      r.end_date,
    ]);
    await conn.query(sql, [values]);
  }
  console.log(`  - skills: ${rows.length} baris`);
}

async function insertClauseRows(conn, rows) {
  if (rows.length === 0) return;
  const sql = `
    INSERT INTO skill_condition_clauses (
      skill_id, group_index, clause_index, variable_name, operator, term_value, raw_term
    ) VALUES ?
  `;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((r) => [
      r.skill_id,
      r.group_index,
      r.clause_index,
      r.variable_name,
      r.operator,
      r.value,
      r.raw_term,
    ]);
    await conn.query(sql, [values]);
  }
  console.log(`  - skill_condition_clauses: ${rows.length} baris`);
}

module.exports = { loadToMysql };
