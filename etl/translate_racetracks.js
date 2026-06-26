/**
 * translate_racetracks.js
 * Isi kolom `name_en` di tabel `racetracks` yang masih kosong/NULL.
 *
 * Racetrack di Uma Musume cuma terbatas: 10 hippodrome JRA (real-world,
 * bukan hasil scrape) + beberapa track luar negeri (Longchamp, Santa
 * Anita, Del Mar, dst). Karena jumlahnya kecil dan namanya adalah fakta
 * dunia nyata, di-hardcode di bawah ini — JAUH lebih aman daripada
 * nge-scrape, dan tidak butuh koneksi ke sumber luar sama sekali.
 *
 * Kalau game update nambah track luar negeri baru, racetrack itu akan
 * masuk ke daftar "tidak ketemu mapping" pas script ini jalan — tinggal
 * tambahkan ke TRACK_NAME_MAP di bawah dan jalankan lagi.
 *
 * CARA PAKAI:
 *   node translate_racetracks.js            -> jalan & langsung update DB
 *   node translate_racetracks.js --dry-run   -> cuma preview, tidak update apa-apa
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

// name_ja (kolom short name, category 35 di master.mdb) -> English name
const TRACK_NAME_MAP = {
  // 10 hippodrome JRA (Jepang)
  '札幌': 'Sapporo',
  '函館': 'Hakodate',
  '福島': 'Fukushima',
  '新潟': 'Niigata',
  '東京': 'Tokyo',
  '中山': 'Nakayama',
  '中京': 'Chukyo',
  '京都': 'Kyoto',
  '阪神': 'Hanshin',
  '小倉': 'Kokura',

  // Track luar negeri (sesuai komentar OVERSEAS_IDS di etl/extract.js:
  // 10201=Longchamp, 10202=Santa Anita, 10203=Del Mar)
  'ロンシャン': 'Longchamp',
  'サンタアニタ': 'Santa Anita',
  'デルマー': 'Del Mar',
};

function normalize(s) {
  return (s || '').trim().normalize('NFKC');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  try {
    const [rows] = await pool.query(
      `SELECT id, name_ja, name_ja_full, name_en FROM racetracks ORDER BY id;`
    );
    console.log(`Total racetrack di database: ${rows.length}`);

    const updates = [];
    const unmatched = [];

    for (const r of rows) {
      if (r.name_en) continue; // sudah ada isinya, jangan ditimpa
      const en = TRACK_NAME_MAP[normalize(r.name_ja)];
      if (en) {
        updates.push({ id: r.id, name_en: en, name_ja: r.name_ja });
      } else {
        unmatched.push(r);
      }
    }

    console.log(`  ✓ cocok dengan mapping: ${updates.length}`);
    console.log(`  ✗ tidak ketemu di mapping: ${unmatched.length}`);

    if (unmatched.length > 0) {
      console.log(
        '\n  Racetrack ini belum ada di TRACK_NAME_MAP (mungkin track baru dari update game).'
      );
      console.log('  Tambahkan manual ke TRACK_NAME_MAP di file ini, lalu jalankan lagi:');
      unmatched.forEach((u) => {
        console.log(`    id=${u.id}  name_ja="${u.name_ja}"  name_ja_full="${u.name_ja_full || ''}"`);
      });
    }

    if (updates.length > 0) {
      console.log('\n  Preview hasil mapping:');
      updates.forEach((u) => console.log(`    ${u.name_ja} -> ${u.name_en}`));
    }

    if (dryRun) {
      console.log('\n[DRY RUN] Tidak ada perubahan yang disimpan ke database.');
      return;
    }

    if (updates.length === 0) {
      console.log('\nTidak ada yang perlu diupdate.');
      return;
    }

    for (const u of updates) {
      await pool.query(`UPDATE racetracks SET name_en = ? WHERE id = ?;`, [u.name_en, u.id]);
    }
    console.log(`\n✓ ${updates.length} racetrack berhasil diupdate (name_en terisi).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✗ GAGAL:', err);
  process.exitCode = 1;
});
