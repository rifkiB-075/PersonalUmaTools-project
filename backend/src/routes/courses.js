/**
 * routes/courses.js
 * GET /api/courses/:courseId/valid-skills -> skill apa saja yang valid di course ini
 */

'use strict';

const express = require('express');
const { getValidSkillsForCourse } = require('../services/skillValidityService');

const router = express.Router();

// GET /api/courses/:courseId/valid-skills?onlyValid=true
router.get('/:courseId/valid-skills', async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    if (!Number.isInteger(courseId)) {
      return res.status(400).json({ error: 'courseId tidak valid' });
    }

    const result = await getValidSkillsForCourse(courseId);
    if (!result) {
      return res.status(404).json({ error: 'Course tidak ditemukan' });
    }

    // Filter opsional: ?onlyValid=true -> cuma kirim skill yang isValid
    const onlyValid = req.query.onlyValid === 'true';
    const skills = onlyValid ? result.skills.filter((s) => s.isValid) : result.skills;

    res.json({
      course: result.course,
      totalSkills: result.skills.length,
      validCount: result.skills.filter((s) => s.isValid).length,
      skills,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
