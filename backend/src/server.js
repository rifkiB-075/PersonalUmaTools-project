/**
 * server.js
 * Entry point backend API untuk kalkulator skill aktivasi Uma Musume.
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const racetrackRoutes = require('./routes/racetracks');
const courseRoutes = require('./routes/courses');
const skillRoutes = require('./routes/skills');
const simulateRoutes = require('./routes/simulate');

const app = express();

// CORS: izinkan origin yang di-set di .env (pisah koma kalau lebih dari satu)
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  })
);
app.use(express.json());

// Routes
app.use('/api/racetracks', racetrackRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/simulate', simulateRoutes);

// Health check sederhana
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Terjadi kesalahan di server', detail: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server berjalan di http://localhost:${PORT}`);
  console.log(`  Coba: http://localhost:${PORT}/api/health`);
  console.log(`  Coba: http://localhost:${PORT}/api/racetracks`);
});
