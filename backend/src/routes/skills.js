/**
 * routes/skills.js
 * GET /api/skills/:id -> detail satu skill, termasuk semua condition clause-nya
 */

'use strict';

const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/skills/:id
router.get('/:id', async (req, res, next) => {
  try {
    const skillId = Number(req.params.id);
    if (!Number.isInteger(skillId)) {
      return res.status(400).json({ error: 'id skill tidak valid' });
    }

    const [skillRows] = await pool.query(
      `SELECT id, rarity, skill_category, name_ja, name_en,
              description_ja, description_en, icon_id,
              precondition_1, condition_1, precondition_2, condition_2
       FROM skills
       WHERE id = ?;`,
      [skillId]
    );

    if (skillRows.length === 0) {
      return res.status(404).json({ error: 'Skill tidak ditemukan' });
    }

    const [clauseRows] = await pool.query(
      `SELECT group_index, clause_index, variable_name, operator, term_value, raw_term
       FROM skill_condition_clauses
       WHERE skill_id = ?
       ORDER BY group_index, clause_index, id;`,
      [skillId]
    );

    res.json({
      skill: skillRows[0],
      conditionClauses: clauseRows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/skills?search=keyword&limit=50
router.get('/', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    let rows;
    if (search) {
      [rows] = await pool.query(
        `SELECT id, name_ja, name_en, rarity, icon_id
         FROM skills
         WHERE name_ja LIKE ? OR name_en LIKE ?
         ORDER BY id
         LIMIT ?;`,
        [`%${search}%`, `%${search}%`, limit]
      );
    } else {
      [rows] = await pool.query(
        `SELECT id, name_ja, name_en, rarity, icon_id
         FROM skills
         ORDER BY id
         LIMIT ?;`,
        [limit]
      );
    }

    res.json({ skills: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
