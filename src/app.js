const logger = require('./utils/logger');
// src/app.js
// Express app — exports app without calling .listen()
// root index.js calls app.listen()
require('dotenv').config();
const express = require('express');
const { getQueueStatus } = require('./services/bookingService');

const app = express();

app.use(express.json());
app.use(express.static('public'));

// ── Simple rate limiter (in-memory) ──────────────────────────────────
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    requestCounts.set(ip, { start: now, count: 1 });
    return next();
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}

app.use('/api', rateLimiter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Live queue API — used by tracker.html
// GET /api/queue/:scheduleId/:date
app.get('/api/queue/:scheduleId/:date', async (req, res) => {
  try {
    const { scheduleId, date } = req.params;

    // Basic input validation
    // Prisma uses CUIDs (25 chars, [a-z0-9]) by default; also allow UUIDs
    if (!/^[a-z0-9]{20,30}$/i.test(scheduleId) && !/^[a-f0-9-]{36}$/i.test(scheduleId)) {
      return res.status(400).json({ error: 'Invalid scheduleId format' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const status = await getQueueStatus(scheduleId, date);
    res.json(status);
  } catch (err) {
    logger.error('[API] Queue status error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
