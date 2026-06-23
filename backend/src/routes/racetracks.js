/**
 * routes/racetracks.js
 * GET /api/racetracks                  -> list semua racetrack
 * GET /api/racetracks/:id/courses      -> list course milik racetrack itu
 */

'use strict';

const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/racetracks
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name_ja, name_ja_full, name_en, area, is_overseas
       FROM racetracks
       ORDER BY id;`
    );
    res.json({ racetracks: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/racetracks/:id/courses
router.get('/:id/courses', async (req, res, next) => {
  try {
    const racetrackId = Number(req.params.id);
    if (!Number.isInteger(racetrackId)) {
      return res.status(400).json({ error: 'id racetrack tidak valid' });
    }

    const [rows] = await pool.query(
      `SELECT id, distance, ground, course_inout, turn, tight_track, distance_category
       FROM racetrack_courses
       WHERE racetrack_id = ?
       ORDER BY distance;`,
      [racetrackId]
    );

    if (rows.length === 0) {
      // Cek apakah racetrack-nya sendiri memang tidak ada, atau cuma tidak ada course
      const [trackRows] = await pool.query(`SELECT id FROM racetracks WHERE id = ?`, [racetrackId]);
      if (trackRows.length === 0) {
        return res.status(404).json({ error: 'Racetrack tidak ditemukan' });
      }
    }

    res.json({ racetrack_id: racetrackId, courses: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
