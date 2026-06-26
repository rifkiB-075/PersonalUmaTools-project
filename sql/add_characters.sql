-- =====================================================================
-- MIGRATION: Tambah data karakter Umamusume
-- Jalankan SETELAH schema.sql sudah ada
-- =====================================================================

USE uma_skill_calc;

-- ---------------------------------------------------------------------
-- 1. CHARACTERS — data profil dasar per karakter (1 baris per chara_id)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS characters (
  id                    INT PRIMARY KEY,        -- chara_id dari master.mdb
  name_ja               VARCHAR(100) NOT NULL,  -- nama karakter (huruf Jepang)
  name_en               VARCHAR(100),           -- diisi manual / komunitas
  birth_year            SMALLINT,
  birth_month           TINYINT,
  birth_day             TINYINT,
  last_year             SMALLINT,               -- tahun terakhir aktif balapan (asli)
  sex                   TINYINT,                -- 1=female, 2=male (sesuai master.mdb)
  height                SMALLINT,               -- tinggi badan (cm)
  race_running_type     TINYINT,                -- gaya lari default (1–4)
  image_color_main      CHAR(6),                -- hex warna utama (tanpa #)
  image_color_sub       CHAR(6),
  ui_color_main         CHAR(6),
  ui_color_sub          CHAR(6),
  start_date            BIGINT,                 -- unix timestamp rilis di game
  chara_category        TINYINT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 2. CHARACTER_CARDS — tiap karakter bisa punya beberapa card (kostum/alt)
--    1 chara_id → banyak card_id, tiap card punya 3 rarity (R/SR/SSR = 3/4/5)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS character_cards (
  card_id               INT NOT NULL,           -- 6 digit: chara_id*100 + nomor card
  chara_id              INT NOT NULL,
  rarity                TINYINT NOT NULL,       -- 3=R, 4=SR, 5=SSR
  is_default_rarity     TINYINT(1) NOT NULL DEFAULT 0,  -- TRUE = rarity utama kartu ini
  PRIMARY KEY (card_id, rarity),
  FOREIGN KEY (chara_id) REFERENCES characters(id),
  INDEX idx_chara (chara_id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 3. CHARACTER_CARD_STATS — base stats per card per rarity
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS character_card_stats (
  card_id               INT NOT NULL,
  rarity                TINYINT NOT NULL,
  speed                 SMALLINT NOT NULL,
  stamina               SMALLINT NOT NULL,
  power                 SMALLINT NOT NULL,
  guts                  SMALLINT NOT NULL,
  wit                   SMALLINT NOT NULL,
  speed_max             SMALLINT NOT NULL,
  stamina_max           SMALLINT NOT NULL,
  power_max             SMALLINT NOT NULL,
  guts_max              SMALLINT NOT NULL,
  wit_max               SMALLINT NOT NULL,
  PRIMARY KEY (card_id, rarity),
  FOREIGN KEY (card_id, rarity) REFERENCES character_cards(card_id, rarity)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 4. CHARACTER_CARD_APTITUDES — proper ground/distance/style per card per rarity
--    Rank: G < F < E < D < C < B < A < S
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS character_card_aptitudes (
  card_id               INT NOT NULL,
  rarity                TINYINT NOT NULL,
  -- Permukaan
  apt_turf              CHAR(1) NOT NULL,       -- S/A/B/C/D/E/F/G
  apt_dirt              CHAR(1) NOT NULL,
  -- Jarak
  apt_short             CHAR(1) NOT NULL,
  apt_mile              CHAR(1) NOT NULL,
  apt_middle            CHAR(1) NOT NULL,
  apt_long              CHAR(1) NOT NULL,
  -- Gaya lari
  apt_nige              CHAR(1) NOT NULL,       -- Front Runner
  apt_senko             CHAR(1) NOT NULL,       -- Pace Chaser
  apt_sashi             CHAR(1) NOT NULL,       -- Late Surger
  apt_oikomi            CHAR(1) NOT NULL,       -- End Closer
  PRIMARY KEY (card_id, rarity),
  FOREIGN KEY (card_id, rarity) REFERENCES character_cards(card_id, rarity)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- 5. CHARACTER_INNATE_SKILLS — skill bawaan (innate) per card per rarity
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS character_innate_skills (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  card_id               INT NOT NULL,
  rarity                TINYINT NOT NULL,
  skill_id              INT NOT NULL,
  skill_level           TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (card_id, rarity) REFERENCES character_cards(card_id, rarity),
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  UNIQUE KEY uniq_card_skill (card_id, rarity, skill_id),
  INDEX idx_skill (skill_id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
