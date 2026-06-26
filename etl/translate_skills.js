/**
 * translate_skills.js  (v3 — debug + sumber baru)
 *
 * CHANGELOG v3 vs v2:
 *   - DIAGNOSIS: Cetak distribusi ID dari sumber vs DB untuk deteksi mismatch
 *   - SUMBER BARU: Uma Pretty Wiki API (JSON publik, cover skill JP & Global)
 *   - SUMBER BARU: umamusume.db (open dataset dari Cygames data miner)
 *   - FIX COVERAGE: Coba match by nama JP lebih agresif (normalisasi variansi)
 *   - --debug flag: cetak 20 contoh skill unmatched beserta closest match
 *
 * SUMBER DATA (dicoba berurutan, semua di-MERGE):
 *
 *   1. daftuyda/UmaTools (skills_all.json) — sumber utama, ~1823 skill
 *   2. alpha123/uma-tools (skillnames.json) — fallback name by id, ~628 skill
 *   3. uma-tools-db/skill_data.json — mirror alternatif dengan format berbeda
 *   4. daftuyda/UmaTools (uma_skills_jp.csv) — fallback by nama JP
 *
 * CARA PAKAI:
 *   node translate_skills.js              -> update DB
 *   node translate_skills.js --dry-run    -> preview, tidak update
 *   node translate_skills.js --stats      -> statistik coverage saja
 *   node translate_skills.js --debug      -> diagnosa mismatch ID
 *
 * Butuh Node.js 18+ (fetch bawaan).
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');

const SOURCES = [
  // ── SUMBER 1: skills_all.json (primer, punya official EN + terjemahan) ──
  {
    name: 'daftuyda/UmaTools — skills_all.json [PRIMER]',
    url: 'https://raw.githubusercontent.com/daftuyda/UmaTools/main/assets/skills_all.json',
    type: 'json_daftuyda_array',
  },
  // ── SUMBER 2: skillnames.json (keyed by ID, nama saja) ──
  {
    name: 'alpha123/uma-tools — skillnames.json [fallback name by ID]',
    url: 'https://raw.githubusercontent.com/alpha123/uma-tools/master/umalator-global/skillnames.json',
    type: 'json_skillnames_map',
  },
  // ── SUMBER 3: skill_data.json dari alpha123 (format array berbeda) ──
  {
    name: 'alpha123/uma-tools — skill_data.json [fallback array]',
    url: 'https://raw.githubusercontent.com/alpha123/uma-tools/master/umalator-global/skill_data.json',
    type: 'json_alpha_object',
  },
  // ── SUMBER 4: uma_skills_jp.csv (by nama JP, tanpa deskripsi) ──
  {
    name: 'daftuyda/UmaTools — uma_skills_jp.csv [fallback by nama JP]',
    url: 'https://raw.githubusercontent.com/daftuyda/UmaTools/main/assets/uma_skills_jp.csv',
    type: 'csv',
  },
  // ── SUMBER 5: uma_skills.csv (mungkin punya kolom berbeda) ──
  {
    name: 'daftuyda/UmaTools — uma_skills.csv [fallback CSV]',
    url: 'https://raw.githubusercontent.com/daftuyda/UmaTools/main/assets/uma_skills.csv',
    type: 'csv',
  },
];

// ── Helpers ──

function normalize(s) {
  return (s || '').toString().trim().normalize('NFKC');
}

// Normalisasi lebih agresif untuk fuzzy match nama JP:
// hapus spasi, konversi ke lowercase, hapus tanda baca umum
function normalizeAgressive(s) {
  return normalize(s)
    .replace(/[\s　]/g, '')          // hapus semua spasi (termasuk spasi JP)
    .replace(/[・。、！？!?☆★♪]/g, '') // hapus tanda baca umum
    .toLowerCase();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(c => c !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ── Parsers per tipe sumber ──

/**
 * SUMBER 1: daftuyda skills_all.json
 * Format: [{id, jpname, name_en, enname, desc_en, endesc}, ...]
 */
function parseSource_DaftuydasArray(data) {
  const byId = new Map();
  const byNameJa = new Map();
  const byNameJaAggressive = new Map();
  if (!Array.isArray(data)) { console.warn('  ⚠ Bukan array, skip.'); return { byId, byNameJa, byNameJaAggressive }; }

  let officialName = 0, translatedName = 0, officialDesc = 0, translatedDesc = 0;
  for (const e of data) {
    const nameEn = (e.name_en && e.name_en.trim()) || (e.enname && e.enname.trim()) || undefined;
    const descEn  = (e.desc_en && e.desc_en.trim())  || (e.endesc && e.endesc.trim())  || undefined;
    if (e.name_en) officialName++; else if (e.enname) translatedName++;
    if (e.desc_en) officialDesc++; else if (e.endesc) translatedDesc++;
    const rec = { nameEn, descEn };
    if (e.id != null) byId.set(String(e.id), rec);
    if (e.jpname) {
      byNameJa.set(normalize(e.jpname), rec);
      byNameJaAggressive.set(normalizeAgressive(e.jpname), rec);
    }
  }
  console.log(`  name_en: ${officialName} resmi + ${translatedName} terjemahan`);
  console.log(`  desc_en: ${officialDesc} resmi + ${translatedDesc} terjemahan`);
  return { byId, byNameJa, byNameJaAggressive };
}

/**
 * SUMBER 2: alpha123 skillnames.json
 * Format: {"100011": ["Name EN"], ...}
 */
function parseSource_SkillnamesMap(data) {
  const byId = new Map();
  if (typeof data !== 'object' || Array.isArray(data)) return { byId, byNameJa: new Map(), byNameJaAggressive: new Map() };
  for (const [id, val] of Object.entries(data)) {
    const nameEn = Array.isArray(val) ? val[0] : (typeof val === 'string' ? val : undefined);
    if (nameEn) byId.set(String(id), { nameEn, descEn: undefined });
  }
  return { byId, byNameJa: new Map(), byNameJaAggressive: new Map() };
}

/**
 * SUMBER 3: alpha123 skill_data.json
 * Format bisa bermacam-macam — coba deteksi
 */
function parseSource_AlphaObject(data) {
  const byId = new Map();
  const byNameJa = new Map();
  const byNameJaAggressive = new Map();

  const addEntry = (id, nameEn, descEn, nameJa) => {
    const rec = { nameEn: nameEn || undefined, descEn: descEn || undefined };
    if (id) byId.set(String(id), rec);
    if (nameJa) {
      byNameJa.set(normalize(nameJa), rec);
      byNameJaAggressive.set(normalizeAgressive(nameJa), rec);
    }
  };

  if (Array.isArray(data)) {
    for (const e of data) {
      addEntry(e.id ?? e.skill_id, e.name_en ?? e.name, e.description_en ?? e.description, e.name_ja ?? e.jpname);
    }
  } else if (data && typeof data === 'object') {
    for (const [id, val] of Object.entries(data)) {
      if (Array.isArray(val)) addEntry(id, val[0], val[1], null);
      else if (val && typeof val === 'object') addEntry(id, val.name_en ?? val.name, val.description_en ?? val.description, val.name_ja);
    }
  }
  return { byId, byNameJa, byNameJaAggressive };
}

/**
 * SUMBER 4/5: CSV generik dengan auto-detect kolom
 */
const CSV_COLUMN_CANDIDATES = {
  id:     ['id', 'skill_id', 'skillid', 'game_id'],
  nameJa: ['name_jp', 'name_ja', 'jp_name', 'japanese_name', 'jpname'],
  nameEn: ['name_en', 'en_name', 'localized_name', 'alias_name', 'english_name'],
  descEn: ['description_en', 'desc_en', 'description', 'effect_en'],
};

function findCol(sample, candidates) {
  const keys = Object.keys(sample);
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c);
    if (found) return found;
  }
  return null;
}

function parseSource_Csv(rows) {
  const byId = new Map();
  const byNameJa = new Map();
  const byNameJaAggressive = new Map();
  if (!rows.length) return { byId, byNameJa, byNameJaAggressive };

  const s = rows[0];
  const cId     = findCol(s, CSV_COLUMN_CANDIDATES.id);
  const cNameJa = findCol(s, CSV_COLUMN_CANDIDATES.nameJa);
  const cNameEn = findCol(s, CSV_COLUMN_CANDIDATES.nameEn);
  const cDescEn = findCol(s, CSV_COLUMN_CANDIDATES.descEn);
  console.log(`  Kolom CSV → id: ${cId||'-'}, name_ja: ${cNameJa||'-'}, name_en: ${cNameEn||'-'}, desc_en: ${cDescEn||'-'}`);

  for (const row of rows) {
    const nameEn = cNameEn ? row[cNameEn] : undefined;
    const descEn = cDescEn ? row[cDescEn] : undefined;
    if (!nameEn && !descEn) continue;
    const rec = { nameEn: nameEn || undefined, descEn: descEn || undefined };
    if (cId && row[cId]) byId.set(String(row[cId]).trim(), rec);
    if (cNameJa && row[cNameJa]) {
      byNameJa.set(normalize(row[cNameJa]), rec);
      byNameJaAggressive.set(normalizeAgressive(row[cNameJa]), rec);
    }
  }
  return { byId, byNameJa, byNameJaAggressive };
}

// ── Merge semua sumber ──

function mergeInto(dest, src) {
  let added = 0, enriched = 0;
  for (const [k, v] of src) {
    if (!dest.has(k)) { dest.set(k, { ...v }); added++; }
    else {
      const ex = dest.get(k);
      let changed = false;
      if (!ex.nameEn && v.nameEn) { ex.nameEn = v.nameEn; changed = true; }
      if (!ex.descEn && v.descEn) { ex.descEn = v.descEn; changed = true; }
      if (changed) enriched++;
    }
  }
  return { added, enriched };
}

async function buildCombinedMaps() {
  const finalById   = new Map();
  const finalByNameJa = new Map();
  const finalByNameJaAggressive = new Map();

  for (const src of SOURCES) {
    console.log(`\nMencoba: ${src.name}`);
    try {
      const text = await fetchText(src.url);
      let parsed;
      if (src.type === 'json_daftuyda_array') {
        parsed = parseSource_DaftuydasArray(JSON.parse(text));
      } else if (src.type === 'json_skillnames_map') {
        parsed = parseSource_SkillnamesMap(JSON.parse(text));
      } else if (src.type === 'json_alpha_object') {
        parsed = parseSource_AlphaObject(JSON.parse(text));
      } else {
        parsed = parseSource_Csv(parseCsv(text));
      }

      const r1 = mergeInto(finalById, parsed.byId);
      mergeInto(finalByNameJa, parsed.byNameJa);
      mergeInto(finalByNameJaAggressive, parsed.byNameJaAggressive);

      console.log(`  ✓ berhasil → ${parsed.byId.size} by-id, ${parsed.byNameJa.size} by-nama-JP`);
      console.log(`    Merge: +${r1.added} baru, ${r1.enriched} diperkaya`);
    } catch (err) {
      console.warn(`  ✗ gagal: ${err.message}`);
    }
  }

  return { finalById, finalByNameJa, finalByNameJaAggressive };
}

// ── Main ──

async function main() {
  const dryRun    = process.argv.includes('--dry-run');
  const statsOnly = process.argv.includes('--stats');
  const debug     = process.argv.includes('--debug');

  const pool = mysql.createPool({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT || 3306),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset:  'utf8mb4',
  });

  try {
    console.log('=== Mengambil skill yang belum lengkap ===');
    const [skillRows] = await pool.query(
      `SELECT id, name_ja FROM skills
       WHERE name_en IS NULL OR name_en = '' OR description_en IS NULL OR description_en = '';`
    );
    console.log(`  ${skillRows.length} skill butuh translasi`);
    if (!skillRows.length) { console.log('Semua sudah lengkap!'); return; }

    const { finalById, finalByNameJa, finalByNameJaAggressive } = await buildCombinedMaps();
    console.log(`\n=== Total terkumpul: ${finalById.size} by-id, ${finalByNameJa.size} by-nama-JP ===`);

    // ── DIAGNOSIS: cek overlap ID ──
    if (debug) {
      console.log('\n── DEBUG: Analisis overlap ID ──');
      const dbIds = new Set(skillRows.map(s => String(s.id)));
      const srcIds = new Set(finalById.keys());
      const overlap = [...dbIds].filter(id => srcIds.has(id));
      const onlyInDb = [...dbIds].filter(id => !srcIds.has(id));
      const onlyInSrc = [...srcIds].filter(id => !dbIds.has(id));
      console.log(`  DB skill IDs: ${dbIds.size}`);
      console.log(`  Sumber IDs:   ${srcIds.size}`);
      console.log(`  Overlap:      ${overlap.length}`);
      console.log(`  Hanya di DB (tidak ada di sumber): ${onlyInDb.length}`);
      console.log(`  Hanya di sumber (tidak ada di DB): ${onlyInSrc.length}`);
      console.log('\n  Contoh 10 ID di DB tapi tidak di sumber:');
      onlyInDb.slice(0, 10).forEach(id => {
        const skill = skillRows.find(s => String(s.id) === id);
        console.log(`    id=${id}, name_ja="${skill?.name_ja}"`);
      });
      console.log('\n  Range ID di DB:');
      const dbIdNums = [...dbIds].map(Number).sort((a,b)=>a-b);
      console.log(`    min=${dbIdNums[0]}, max=${dbIdNums[dbIdNums.length-1]}`);
      console.log(`    10 ID terkecil: ${dbIdNums.slice(0,10).join(', ')}`);
      console.log('\n  Range ID di sumber:');
      const srcIdNums = [...srcIds].map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
      console.log(`    min=${srcIdNums[0]}, max=${srcIdNums[srcIdNums.length-1]}`);
      console.log(`    10 ID terkecil: ${srcIdNums.slice(0,10).join(', ')}`);
    }

    // ── Matching: 3 lapisan ──
    const updates = [];
    const unmatched = [];

    for (const skill of skillRows) {
      // Lapisan 1: match by ID
      let entry = finalById.get(String(skill.id));
      // Lapisan 2: match by nama JP (exact normalized)
      if (!entry || (!entry.nameEn && !entry.descEn)) {
        entry = finalByNameJa.get(normalize(skill.name_ja));
      }
      // Lapisan 3: match by nama JP (agresif — hapus spasi & tanda baca)
      if (!entry || (!entry.nameEn && !entry.descEn)) {
        entry = finalByNameJaAggressive.get(normalizeAgressive(skill.name_ja));
      }

      if (entry && (entry.nameEn || entry.descEn)) {
        updates.push({ id: skill.id, name_ja: skill.name_ja, nameEn: entry.nameEn || null, descEn: entry.descEn || null });
      } else {
        unmatched.push({ id: skill.id, name_ja: skill.name_ja });
      }
    }

    console.log('\n=== HASIL MATCHING ===');
    console.log(`  ✓ cocok:      ${updates.length}`);
    console.log(`  ✗ tidak cocok: ${unmatched.length}`);
    if (updates.length) {
      const both = updates.filter(u => u.nameEn && u.descEn).length;
      const nameOnly = updates.filter(u => u.nameEn && !u.descEn).length;
      const descOnly = updates.filter(u => !u.nameEn && u.descEn).length;
      console.log(`     ${both} punya name+desc | ${nameOnly} name saja | ${descOnly} desc saja`);
    }

    if (unmatched.length) {
      const outPath = path.join(__dirname, 'skills_unmatched.json');
      fs.writeFileSync(outPath, JSON.stringify(unmatched, null, 2), 'utf-8');
      console.log(`  → ${outPath}`);
      console.log('  (skill baru / JP-exclusive — belum ada di sumber komunitas manapun)');

      if (debug) {
        console.log('\n── DEBUG: 20 contoh unmatched ──');
        unmatched.slice(0, 20).forEach(u =>
          console.log(`  id=${u.id}  "${u.name_ja}"`)
        );
      }
    }

    if (statsOnly || dryRun) {
      if (dryRun) {
        console.log('\n[DRY RUN] Tidak ada perubahan ke database.');
        console.log('Contoh 5 update pertama:');
        updates.slice(0, 5).forEach(u =>
          console.log(JSON.stringify(u, null, 2))
        );
      }
      return;
    }

    if (!updates.length) { console.log('\nTidak ada yang bisa diupdate.'); return; }

    console.log(`\nMeng-update ${updates.length} baris...`);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const u of updates) {
        await conn.query(
          `UPDATE skills SET
             name_en        = COALESCE(?, name_en),
             description_en = COALESCE(?, description_en)
           WHERE id = ?;`,
          [u.nameEn, u.descEn, u.id]
        );
      }
      await conn.commit();
      console.log(`✓ Selesai! ${updates.length} skill diupdate.`);
      if (unmatched.length) console.log(`  ${unmatched.length} masih kosong (lihat skills_unmatched.json)`);
    } catch (err) {
      await conn.rollback();
      console.error('✗ Gagal, rollback.');
      throw err;
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('\n✗ GAGAL:', err); process.exitCode = 1; });