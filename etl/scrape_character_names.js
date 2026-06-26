'use strict';

require('dotenv').config({ path: `${__dirname}/../backend/.env` });
const mysql = require('mysql2/promise');

const MANIFEST_URL = 'https://gametora.com/data/manifests/umamusume.json';

async function getPool() {
  return mysql.createPool({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'uma_skill_calc',
    waitForConnections: true,
    connectionLimit: 5,
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function main() {
  // 1. Fetch manifest
  console.log('📡  Fetching manifest...');
  const manifest = await fetchJson(MANIFEST_URL);
  const hash = manifest['characters'];
  if (!hash) throw new Error('Key "characters" tidak ditemukan di manifest');
  console.log(`    hash: ${hash}`);

  // 2. Fetch data karakter
  const dataUrl = `https://gametora.com/data/umamusume/characters.${hash}.json`;
  console.log(`📡  Fetching characters dari ${dataUrl}...`);
  const chars = await fetchJson(dataUrl);
  console.log(`    ${chars.length} karakter ditemukan`);

  // 3. Koneksi DB
  console.log('\n🔌  Menghubungkan ke database...');
  const pool = await getPool();

  let updated = 0, skipped = 0, notFound = 0;

  for (const c of chars) {
    const { char_id, en_name } = c;

    if (!en_name) {
      skipped++;
      continue;
    }

    const [result] = await pool.execute(
      `UPDATE characters SET name_en = ? WHERE id = ? AND name_en IS NULL`,
      [en_name, char_id]
    );

    if (result.affectedRows > 0) {
      updated++;
    } else {
      // Cek apakah ID memang tidak ada di DB
      const [[row]] = await pool.execute(
        `SELECT id, name_en FROM characters WHERE id = ?`,
        [char_id]
      );
      if (!row) {
        notFound++;
      } else {
        // ID ada tapi name_en sudah terisi — skip
        skipped++;
      }
    }
  }

  await pool.end();

  console.log('\n✅  Selesai!');
  console.log(`    Updated  : ${updated}`);
  console.log(`    Skipped  : ${skipped} (sudah ada name_en atau en_name kosong)`);
  console.log(`    Not found: ${notFound} (char_id tidak ada di DB — wajar untuk NPC/trainer)`);
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});