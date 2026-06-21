/**
 * run.js
 * Entry point ETL: extract dari master.mdb -> transform (parse condition) -> load ke MySQL.
 *
 * CARA PAKAI:
 *   1. cd etl
 *   2. npm install
 *   3. Copy .env.example jadi .env, isi MASTER_MDB_PATH dan kredensial MySQL kamu
 *   4. Pastikan schema.sql sudah dijalankan di MySQL kamu (lihat ../sql/schema.sql)
 *   5. npm start
 */

'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

const { extractFromMasterMdb } = require('./extract');
const { transformSkillConditions } = require('./transform');
const { loadToMysql } = require('./load');

async function main() {
  const mdbPath = process.env.MASTER_MDB_PATH;
  if (!mdbPath) {
    throw new Error('MASTER_MDB_PATH belum di-set di file .env');
  }

  console.log('=== TAHAP 1: EXTRACT dari master.mdb ===');
  console.log(`Membaca: ${mdbPath}`);
  const { racetracks, racetrackCourses, skills } = extractFromMasterMdb(mdbPath);
  console.log(`  - racetracks ditemukan: ${racetracks.length}`);
  console.log(`  - racetrack_courses ditemukan: ${racetrackCourses.length}`);
  console.log(`  - skills ditemukan: ${skills.length}`);

  console.log('\n=== TAHAP 2: TRANSFORM (parse formula condition) ===');
  const { clauseRows, parseErrors } = transformSkillConditions(skills);
  console.log(`  - clause rows berhasil di-parse: ${clauseRows.length}`);

  if (parseErrors.length > 0) {
    console.warn(`  ⚠ ${parseErrors.length} formula GAGAL di-parse:`);
    parseErrors.slice(0, 20).forEach((e) => {
      console.warn(`    skill ${e.skillId} [${e.field}]: ${e.error}`);
    });
    if (parseErrors.length > 20) {
      console.warn(`    ... dan ${parseErrors.length - 20} error lainnya (lihat parse_errors.json)`);
    }
    // Simpan semua error ke file supaya bisa diperiksa nanti, jangan sampai hilang
    const fs = require('fs');
    fs.writeFileSync(
      require('path').join(__dirname, 'parse_errors.json'),
      JSON.stringify(parseErrors, null, 2),
      'utf-8'
    );
  }

  console.log('\n=== TAHAP 3: LOAD ke MySQL ===');
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  try {
    await loadToMysql(pool, { racetracks, racetrackCourses, skills, clauseRows });
  } finally {
    await pool.end();
  }

  console.log('\n=== SELESAI ===');
  console.log('Database kamu sudah terisi data terbaru dari master.mdb.');
}

main().catch((err) => {
  console.error('\n✗ ETL GAGAL:');
  console.error(err);
  process.exitCode = 1;
});
