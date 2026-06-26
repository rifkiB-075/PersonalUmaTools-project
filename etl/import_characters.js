/**
 * import_characters.js
 *
 * ETL: Import data karakter dari uma_characters.xlsx ke database MySQL.
 *
 * Sheet yang diproses:
 *   - Characters        → tabel `characters` + `character_cards`
 *   - Base Stats        → tabel `character_card_stats`
 *   - Proper Ground     → tabel `character_card_aptitudes`
 *   - Skills            → tabel `character_innate_skills`
 *
 * Usage:
 *   node import_characters.js <path/to/uma_characters.xlsx>
 *
 * Env vars (sama seperti etl/.env):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *
 * Catatan:
 *   - Script ini IDEMPOTENT: pakai INSERT IGNORE / ON DUPLICATE KEY UPDATE
 *     sehingga aman dijalankan ulang tanpa duplikasi.
 *   - Tabel target harus sudah dibuat via add_characters.sql sebelum dijalankan.
 *   - Kolom name_en di `characters` TIDAK diisi (null) — diisi manual terpisah.
 */

'use strict';

require('dotenv').config({ path: `${__dirname}/../backend/.env` });
const path    = require('path');
const mysql   = require('mysql2/promise');
const XLSX    = require('xlsx');

// ---------------------------------------------------------------------------
// Koneksi DB
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Baca XLSX ke object { sheetName: [ {col: value, ...}, ... ] }
// ---------------------------------------------------------------------------
function readXlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const result = {};
  for (const name of wb.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helper: insert batch dengan ON DUPLICATE KEY UPDATE
// ---------------------------------------------------------------------------
async function upsertBatch(pool, table, rows, updateCols) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const placeholders = rows.map(() => `(${keys.map(() => '?').join(',')})`).join(',');
  const values = rows.flatMap(r => keys.map(k => r[k]));
  const onDup = updateCols.map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
  const sql = `INSERT INTO \`${table}\` (${keys.map(k=>`\`${k}\``).join(',')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${onDup}`;
  await pool.execute(sql, values);
}

// ---------------------------------------------------------------------------
// Helper: insert batch dengan INSERT IGNORE (untuk relasi FK)
// ---------------------------------------------------------------------------
async function insertIgnoreBatch(pool, table, rows) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const placeholders = rows.map(() => `(${keys.map(() => '?').join(',')})`).join(',');
  const values = rows.flatMap(r => keys.map(k => r[k]));
  const sql = `INSERT IGNORE INTO \`${table}\` (${keys.map(k=>`\`${k}\``).join(',')}) VALUES ${placeholders}`;
  await pool.execute(sql, values);
}

// ---------------------------------------------------------------------------
// 1. Import Characters → characters + character_cards
// ---------------------------------------------------------------------------
async function importCharacters(pool, rows) {
  console.log(`  → ${rows.length} karakter ditemukan`);

  const charRows   = [];
  const cardRows   = [];
  const seenChara  = new Set();

  for (const r of rows) {
    const charaId = r['id'];
    if (!seenChara.has(charaId)) {
      seenChara.add(charaId);
      charRows.push({
        id:                 charaId,
        name_ja:            r['chara_name'],
        name_en:            null,            // diisi manual
        birth_year:         r['birth_year'],
        birth_month:        r['birth_month'],
        birth_day:          r['birth_day'],
        last_year:          r['last_year'],
        sex:                r['sex'],
        height:             r['height'],
        race_running_type:  r['race_running_type'],
        image_color_main:   r['image_color_main'],
        image_color_sub:    r['image_color_sub'],
        ui_color_main:      r['ui_color_main'],
        ui_color_sub:       r['ui_color_sub'],
        start_date:         r['start_date'],
        chara_category:     r['chara_category'],
      });
    }
  }

  // character_cards dibuat dari Base Stats (ada card_id + rarity)
  // — diisi di importBaseStats, tapi kita pre-populate dari Characters sheet
  // dengan asumsi card_id default = charaId * 100 + 01 (kosong, skip di sini)

  await upsertBatch(pool, 'characters', charRows, [
    'name_ja','birth_year','birth_month','birth_day','last_year','sex',
    'height','race_running_type','image_color_main','image_color_sub',
    'ui_color_main','ui_color_sub','start_date','chara_category',
  ]);
  console.log(`  ✓ characters: ${charRows.length} upserted`);
}

// ---------------------------------------------------------------------------
// 2. Import Base Stats → character_cards + character_card_stats
// ---------------------------------------------------------------------------
async function importBaseStats(pool, rows) {
  console.log(`  → ${rows.length} baris base stats`);

  const cardRows  = [];
  const statRows  = [];
  const seenCard  = new Set();

  for (const r of rows) {
    const cardId = r['card_id'];
    const rarity = r['rarity'];
    const key    = `${cardId}:${rarity}`;

    if (!seenCard.has(key)) {
      seenCard.add(key);
      cardRows.push({
        card_id:           cardId,
        chara_id:          r['chara_id'],
        rarity:            rarity,
        is_default_rarity: r['is_default_rarity'] === true || r['is_default_rarity'] === 'TRUE' ? 1 : 0,
      });
    }

    statRows.push({
      card_id:     cardId,
      rarity:      rarity,
      speed:       r['Speed'],
      stamina:     r['Stamina'],
      power:       r['Power'],
      guts:        r['Guts'],
      wit:         r['Wit'],
      speed_max:   r['Speed (Max)'],
      stamina_max: r['Stamina (Max)'],
      power_max:   r['Power (Max)'],
      guts_max:    r['Guts (Max)'],
      wit_max:     r['Wit (Max)'],
    });
  }

  await upsertBatch(pool, 'character_cards', cardRows, ['is_default_rarity']);
  console.log(`  ✓ character_cards: ${cardRows.length} upserted`);

  await upsertBatch(pool, 'character_card_stats', statRows, [
    'speed','stamina','power','guts','wit',
    'speed_max','stamina_max','power_max','guts_max','wit_max',
  ]);
  console.log(`  ✓ character_card_stats: ${statRows.length} upserted`);
}

// ---------------------------------------------------------------------------
// 3. Import Proper Ground → character_card_aptitudes
// ---------------------------------------------------------------------------
async function importAptitudes(pool, rows) {
  console.log(`  → ${rows.length} baris aptitudes`);

  const aptRows = rows.map(r => ({
    card_id:    r['card_id'],
    rarity:     r['rarity'],
    apt_turf:   r['Turf'],
    apt_dirt:   r['Dirt'],
    apt_short:  r['Short'],
    apt_mile:   r['Mile'],
    apt_middle: r['Middle'],
    apt_long:   r['Long'],
    apt_nige:   r['Nige'],
    apt_senko:  r['Senko'],
    apt_sashi:  r['Sashi'],
    apt_oikomi: r['Oikomi'],
  }));

  await upsertBatch(pool, 'character_card_aptitudes', aptRows, [
    'apt_turf','apt_dirt','apt_short','apt_mile','apt_middle','apt_long',
    'apt_nige','apt_senko','apt_sashi','apt_oikomi',
  ]);
  console.log(`  ✓ character_card_aptitudes: ${aptRows.length} upserted`);
}

// ---------------------------------------------------------------------------
// 4. Import Skills → character_innate_skills
//    Hanya insert skill yang skill_id-nya ADA di tabel skills (FK constraint)
// ---------------------------------------------------------------------------
async function importInnateSkills(pool, rows) {
  console.log(`  → ${rows.length} baris innate skills`);

  // Ambil semua skill_id yang sudah ada di DB
  const [existing] = await pool.execute('SELECT id FROM skills');
  const validSkillIds = new Set(existing.map(r => r.id));

  const skillRows = [];
  let skipped = 0;

  for (const r of rows) {
    const skillId = r['skill_id'];
    if (!validSkillIds.has(skillId)) {
      skipped++;
      continue;
    }
    skillRows.push({
      card_id:     r['card_id'],
      rarity:      r['rarity'],
      skill_id:    skillId,
      skill_level: r['skill_level'] ?? 1,
    });
  }

  if (skipped > 0) {
    console.log(`  ⚠  ${skipped} innate skills dilewati (skill_id tidak ada di tabel skills)`);
  }

  // Batch insert 500 per query
  const BATCH = 500;
  for (let i = 0; i < skillRows.length; i += BATCH) {
    await insertIgnoreBatch(pool, 'character_innate_skills', skillRows.slice(i, i + BATCH));
  }
  console.log(`  ✓ character_innate_skills: ${skillRows.length} inserted (ignore dup)`);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: node import_characters.js <path/to/uma_characters.xlsx>');
    process.exit(1);
  }

  const absPath = path.resolve(xlsxPath);
  console.log(`\n📂  Membaca file: ${absPath}`);
  const sheets = readXlsx(absPath);

  const required = ['Characters', 'Base Stats', 'Proper Ground', 'Skills'];
  for (const s of required) {
    if (!sheets[s]) {
      console.error(`❌  Sheet "${s}" tidak ditemukan di file XLSX`);
      process.exit(1);
    }
  }

  console.log('\n🔌  Menghubungkan ke database...');
  const pool = await getPool();

  try {
    console.log('\n[1/4] Characters');
    await importCharacters(pool, sheets['Characters']);

    console.log('\n[2/4] Base Stats');
    await importBaseStats(pool, sheets['Base Stats']);

    console.log('\n[3/4] Proper Ground (Aptitudes)');
    await importAptitudes(pool, sheets['Proper Ground']);

    console.log('\n[4/4] Innate Skills');
    await importInnateSkills(pool, sheets['Skills']);

    console.log('\n✅  Import selesai!');
  } catch (err) {
    console.error('\n❌  Error saat import:', err.message);
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('   → Pastikan sudah menjalankan sql/add_characters.sql terlebih dahulu.');
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      console.error('   → Ada FK violation. Pastikan tabel skills sudah terisi sebelum import innate skills.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
