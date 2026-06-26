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

---

## Backend API (folder `backend/`)

Server Express yang menyajikan data dari MySQL ke frontend.

### Setup

```bash
cd backend
npm install
copy .env.example .env
```

Edit `.env`, isi kredensial MySQL yang sama dengan yang dipakai ETL, dan
`CORS_ORIGIN` sesuai alamat frontend kamu nanti (default `http://localhost:5173`
untuk Vite dev server).

### Jalankan

```bash
npm start
```

Server akan jalan di `http://localhost:3000` (atau sesuai `PORT` di `.env`).

### Endpoint yang tersedia

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/health` | Cek server hidup |
| GET | `/api/racetracks` | List semua racetrack |
| GET | `/api/racetracks/:id/courses` | List course (distance+ground) milik racetrack itu |
| GET | `/api/courses/:courseId/valid-skills` | **Endpoint inti**: skill apa saja yang valid di course ini. Tambah `?onlyValid=true` untuk cuma dapat skill yang valid saja |
| GET | `/api/skills/:id` | Detail satu skill + semua condition clause-nya |
| GET | `/api/skills?search=keyword` | Cari skill berdasarkan nama |

### Contoh pemakaian (alur frontend nanti)

```
1. GET /api/racetracks
   -> user pilih "Tokyo" (id: 10006)

2. GET /api/racetracks/10006/courses
   -> user pilih course "2400m Turf" (id: misal 10608)

3. GET /api/courses/10608/valid-skills?onlyValid=true
   -> dapat daftar skill yang possibly valid di course itu
```

### Cara kerja logika validitas (Tahap 1)

`services/skillValidityService.js` mengevaluasi tiap skill terhadap 4
variabel STATIS yang terikat track/course: `track_id`, `course_distance`,
`distance_type`, `ground_type`. Variabel RUNTIME (seperti `distance_rate`,
`order_rate`, `phase`, dll — yang nilainya berubah sepanjang race) diabaikan
di tahap ini; skill yang punya term runtime tapi term statisnya cocok
(atau tidak punya term statis sama sekali) dianggap **possibly valid**.

Ini akan dikembangkan lebih lanjut di Tahap 2 (simulasi posisi race) nanti.

---

## Tahap Translasi (isi `name_en` & `description_en`)

Setelah ETL jalan, kolom `name_en`/`description_en` di `skills` dan `name_en`
di `racetracks` masih kosong (lihat catatan di atas). Dua script ini ngisi
kolom-kolom itu:

```bash
cd etl
npm run translate:tracks   # racetrack: pakai mapping nama JRA + overseas (hardcoded, sudah pasti)
npm run translate:skills   # skill: fetch data komunitas yang sourced dari GameTora, lalu di-match
```

Tambahkan `--dry-run` di belakang kalau cuma mau preview tanpa nge-update
database, mis. `node translate_skills.js --dry-run`.

**Tentang `translate:skills`:** GameTora tidak punya API publik, jadi script
ini ambil dari file data yang di-maintain tool komunitas lain yang sudah
scrape GameTora (`alpha123/uma-tools`, `daftuyda/UmaTools`) — lihat komentar
di awal `translate_skills.js` untuk detail & kalau ada link yang sudah mati/
pindah. Setelah dijalankan:

- Skill yang **cocok** langsung di-UPDATE ke database.
- Skill yang **tidak cocok** (biasanya skill baru yang belum sempat ke-scrape,
  atau beda format nama) disimpan ke `etl/skills_unmatched.json` buat dicek
  & diisi manual.

Aman dijalankan berkali-kali — yang sudah punya `name_en`/`description_en`
tidak akan ditimpa ulang.


