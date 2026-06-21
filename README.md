# Uma Musume Skill ETL

Pipeline untuk extract data skill & racetrack dari `master.mdb` (Uma Musume:
Pretty Derby) ke database MySQL/MariaDB sendiri.

## Struktur

```
uma-project/
├── sql/
│   └── schema.sql          <- jalankan ini dulu di MySQL kamu
└── etl/
    ├── conditionParser.js  <- parser formula kondisi aktivasi skill
    ├── extract.js          <- baca master.mdb (SQLite)
    ├── transform.js        <- parse semua condition_1/condition_2
    ├── load.js              <- insert ke MySQL
    ├── run.js               <- entry point, jalankan ini
    ├── test_conditionParser.js  <- unit test parser (26 test, semua pass)
    ├── package.json
    └── .env.example
```

## Cara pakai

### 1. Siapkan database MySQL

```bash
mysql -u root -p < sql/schema.sql
```

Ini akan membuat database `uma_skill_calc` beserta semua tabelnya.

### 2. Setup ETL

```bash
cd etl
npm install
copy .env.example .env
```

Edit `.env`, isi:
- `MASTER_MDB_PATH` — path lengkap ke file `master.mdb` kamu
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — kredensial MySQL kamu

### 3. (Opsional tapi disarankan) Jalankan test dulu

```bash
node test_conditionParser.js
```

Harus muncul `26 passed, 0 failed`. Kalau ada yang gagal, JANGAN lanjut ke
langkah berikutnya — berarti ada perubahan format formula yang belum
ke-handle parser.

### 4. Jalankan ETL

```bash
npm start
```

Ini akan:
1. Baca semua racetrack, course, dan skill dari `master.mdb`
2. Parse formula `condition_1`/`condition_2` tiap skill jadi baris-baris
   term terstruktur
3. TRUNCATE tabel lama lalu insert data baru ke MySQL (dalam satu transaction
   — kalau gagal di tengah jalan, database tidak berubah sama sekali)

Kalau ada formula yang gagal di-parse (seharusnya tidak ada, karena sudah
ditest dengan 2082+ skill asli), detailnya akan tersimpan di
`etl/parse_errors.json` supaya bisa diperiksa.

## Catatan penting

- **Translasi Inggris**: kolom `name_en` dan `description_en` di tabel
  `skills`, serta `name_en` di `racetracks`, SENGAJA dibiarkan kosong oleh
  ETL ini karena `master.mdb` versi JP tidak punya teks Inggris. Perlu diisi
  manual/terpisah (mis. dari GameTora atau sumber lain) lewat UPDATE query
  setelah ETL selesai jalan.
- **Re-run aman**: script ini TRUNCATE tabel sebelum insert ulang, jadi aman
  dijalankan berkali-kali tiap kali game update (tinggal jalankan lagi
  `npm start` dengan `master.mdb` versi terbaru).
- **Tahap 1 vs Tahap 2**: `conditionParser.js` punya mode `strict` dan
  `non-strict` di fungsi `evaluateCondition()`. Untuk filter sederhana
  "skill apa yang valid di track ini" pakai non-strict (variabel runtime
  seperti `distance_rate` diabaikan). Untuk simulasi posisi race penuh nanti,
  pakai strict dengan context lengkap.
