'use strict';

/**
 * routes/characters.js
 *
 * GET /api/characters          → list semua karakter (dengan filter & search)
 * GET /api/characters/:id      → detail 1 karakter + semua card-nya
 */

const express = require('express');
const pool    = require('../db/pool');
const router  = express.Router();

// ---------------------------------------------------------------------------
// GET /api/characters
// Query params:
//   search  string  — filter nama (JP atau EN)
//   limit   number  — default 100
//   offset  number  — default 0
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const limit  = Math.min(Number(req.query.limit)  || 100, 200);
    const offset = Number(req.query.offset) || 0;

    let where = '';
    const params = [];
    if (search) {
      where = 'WHERE (c.name_ja LIKE ? OR c.name_en LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT
         c.id, c.name_ja, c.name_en,
         c.birth_year, c.birth_month, c.birth_day,
         c.sex, c.height, c.race_running_type,
         c.image_color_main, c.ui_color_main,
         c.start_date
       FROM characters c
       ${where}
       ORDER BY c.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM characters c ${where}`,
      params
    );

    res.json({ characters: rows, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/characters/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID harus berupa integer' });
    }

    // Karakter dasar
    const [[chara]] = await pool.query(
      `SELECT * FROM characters WHERE id = ?`, [id]
    );
    if (!chara) {
      return res.status(404).json({ error: `Karakter ID ${id} tidak ditemukan` });
    }

    // Semua card milik karakter ini
    const [cards] = await pool.query(
      `SELECT
         cc.card_id, cc.rarity, cc.is_default_rarity,
         s.speed, s.stamina, s.power, s.guts, s.wit,
         s.speed_max, s.stamina_max, s.power_max, s.guts_max, s.wit_max,
         a.apt_turf, a.apt_dirt,
         a.apt_short, a.apt_mile, a.apt_middle, a.apt_long,
         a.apt_nige, a.apt_senko, a.apt_sashi, a.apt_oikomi
       FROM character_cards cc
       LEFT JOIN character_card_stats      s ON s.card_id = cc.card_id AND s.rarity = cc.rarity
       LEFT JOIN character_card_aptitudes  a ON a.card_id = cc.card_id AND a.rarity = cc.rarity
       WHERE cc.chara_id = ?
       ORDER BY cc.card_id ASC, cc.rarity ASC`,
      [id]
    );

    // Innate skills (per card per rarity)
    const [innateRows] = await pool.query(
      `SELECT
         cis.card_id, cis.rarity, cis.skill_id, cis.skill_level,
         sk.name_ja, sk.name_en, sk.rarity AS skill_rarity, sk.icon_id
       FROM character_innate_skills cis
       JOIN skills sk ON sk.id = cis.skill_id
       WHERE cis.card_id IN (
         SELECT card_id FROM character_cards WHERE chara_id = ?
       )
       ORDER BY cis.card_id, cis.rarity, cis.skill_id`,
      [id]
    );

    // Kelompokkan innate skills ke dalam setiap card
    const innateMap = {};
    for (const row of innateRows) {
      const key = `${row.card_id}:${row.rarity}`;
      if (!innateMap[key]) innateMap[key] = [];
      innateMap[key].push({
        skill_id:    row.skill_id,
        skill_level: row.skill_level,
        name_ja:     row.name_ja,
        name_en:     row.name_en,
        rarity:      row.skill_rarity,
        icon_id:     row.icon_id,
      });
    }

    const cardsWithSkills = cards.map(c => ({
      ...c,
      innate_skills: innateMap[`${c.card_id}:${c.rarity}`] || [],
    }));

    res.json({ character: chara, cards: cardsWithSkills });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
