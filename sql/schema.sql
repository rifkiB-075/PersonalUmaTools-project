-- =====================================================================
-- SKEMA DATABASE: Uma Musume Skill Activation Calculator
-- Target: MySQL / MariaDB
-- =====================================================================
-- Catatan:
-- - Semua tabel pakai utf8mb4 karena data Jepang butuh full UTF-8.
-- - Tabel `*_translation` dipisah dari tabel utama supaya gampang
--   nambah bahasa lain di masa depan (mis. Indonesia) tanpa ubah skema inti.
-- - Data asal (race_track, race_course_set, skill_data, skill_condition)
--   mengikuti struktur master.mdb supaya gampang di-sync ulang tiap update game.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS uma_skill_calc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE uma_skill_calc;

-- ---------------------------------------------------------------------
-- 1. RACETRACK (race_track + race_course_set dari master.mdb)
-- ---------------------------------------------------------------------

CREATE TABLE racetracks (
  id              INT PRIMARY KEY,        -- sama dengan race_track.id di master.mdb
  name_ja         VARCHAR(100) NOT NULL,  -- dari text_data category=35 (nama singkat)
  name_ja_full    VARCHAR(150),           -- dari text_data category=31/34 (nama lengkap, mis. "...レース場")
  name_en         VARCHAR(100),           -- diisi manual / dari GameTora
  area            INT,                    -- dari race_track.area (region grouping, kalau perlu)
  is_overseas     TINYINT(1) DEFAULT 0,   -- 1 kalau track luar negeri (Longchamp, dll)
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE racetrack_courses (
  id                  INT PRIMARY KEY,     -- sama dengan race_course_set.id di master.mdb
  racetrack_id        INT NOT NULL,
  distance            INT NOT NULL,        -- dalam meter
  ground              TINYINT NOT NULL,    -- 1 = turf, 2 = dirt
  course_inout        TINYINT,             -- inner/outer course variant (nama 'inout' reserved di MySQL)
  turn                TINYINT,             -- arah putaran / jumlah belokan (sesuai raw data)
  tight_track         TINYINT(1) NOT NULL DEFAULT 0, -- 1 = "小回り" (tight/compact course), LANGSUNG dari master.mdb race_course_set.tight_track -- bukan inferensi, ground truth dari game
  distance_category   ENUM('short','mile','middle','long') GENERATED ALWAYS AS (
    CASE
      WHEN distance <= 1400 THEN 'short'
      WHEN distance <= 1800 THEN 'mile'
      WHEN distance <= 2400 THEN 'middle'
      ELSE 'long'
    END
  ) STORED,
  FOREIGN KEY (racetrack_id) REFERENCES racetracks(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 2. SKILL (skill_data dari master.mdb)
-- ---------------------------------------------------------------------

CREATE TABLE skills (
  id                  INT PRIMARY KEY,        -- skill_data.id
  rarity              TINYINT,                -- 1=normal, 2=rare(gold), 3=unique, dst (cross-check di game)
  skill_category      INT,
  name_ja             VARCHAR(150) NOT NULL,   -- text_data category=47
  name_en             VARCHAR(150),            -- diisi manual / GameTora
  description_ja      TEXT,                    -- text_data category=48
  description_en      TEXT,
  icon_id             INT,
  -- Kondisi aktivasi mentah (formula asli, disimpan apa adanya untuk parsing ulang)
  precondition_1      TEXT,
  condition_1         TEXT,
  precondition_2       TEXT,
  condition_2         TEXT,
  is_general_skill    TINYINT(1),
  start_date          BIGINT,                 -- unix timestamp; BIGINT karena ada nilai placeholder besar (mis. 253402300799 = "tak terbatas")
  end_date            BIGINT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 3. PARSED SKILL CONDITIONS
-- ---------------------------------------------------------------------
-- condition_1 / condition_2 di skill_data adalah formula string seperti:
--   "distance_rate>=50&distance_rate<=60&order_rate>50"
-- Tabel ini menyimpan hasil PARSING dari formula itu jadi baris-baris
-- terstruktur, supaya bisa di-query langsung tanpa parse ulang tiap request.
--
-- Setiap baris = satu syarat individual (mis. "distance_rate >= 50").
-- group_index membedakan condition_1 (group 1) vs condition_2 (group 2).
-- clause_index membedakan OR-group kalau formula punya '@' (multiple alternatif).

CREATE TABLE skill_condition_clauses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  skill_id        INT NOT NULL,
  group_index     TINYINT NOT NULL,      -- 1 = dari condition_1, 2 = dari condition_2
  clause_index    TINYINT NOT NULL,      -- ke berapa di antara klausa yang dipisah '@' (OR)
  variable_name   VARCHAR(100) NOT NULL, -- mis. 'distance_rate', 'order_rate'; 100 char = margin aman (terpanjang ditemukan: 52 char)
  operator        VARCHAR(3) NOT NULL,   -- '>=', '<=', '>', '<', '=='
  term_value      INT NOT NULL,          -- nama 'value' reserved/ambigu di beberapa versi MySQL
  raw_term        VARCHAR(100) NOT NULL, -- term asli sebelum diparse, untuk debug
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  INDEX idx_skill_variable (skill_id, variable_name)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 4. RACE SETUP (input dari user untuk kalkulasi)
-- ---------------------------------------------------------------------
-- Bukan tabel data master, tapi referensi enum buat dipakai backend/frontend
-- saat membangun "race context" untuk evaluasi kondisi skill.

CREATE TABLE running_styles (
  id    TINYINT PRIMARY KEY,
  code  VARCHAR(20) NOT NULL,   -- 'nige', 'senko', 'sashi', 'oikomi'
  name_ja VARCHAR(20),
  name_en VARCHAR(20)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

INSERT INTO running_styles (id, code, name_ja, name_en) VALUES
  (1, 'nige',    '逃げ',   'Front Runner'),
  (2, 'senko',   '先行',   'Pace Chaser'),
  (3, 'sashi',   '差し',   'Late Surger'),
  (4, 'oikomi',  '追込',   'End Closer');

-- ---------------------------------------------------------------------
-- 5. (OPSIONAL) Tabel cache hasil kalkulasi, kalau perlu precompute
-- ---------------------------------------------------------------------
-- Berguna kalau nanti mau cache "skill mana yang valid utk course+style X"
-- supaya tidak parse ulang formula tiap request.

CREATE TABLE skill_track_validity_cache (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  skill_id            INT NOT NULL,
  racetrack_course_id INT NOT NULL,
  running_style_id    TINYINT,
  is_valid            TINYINT(1) NOT NULL,
  computed_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (racetrack_course_id) REFERENCES racetrack_courses(id),
  FOREIGN KEY (running_style_id) REFERENCES running_styles(id),
  UNIQUE KEY uniq_combo (skill_id, racetrack_course_id, running_style_id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
