const logger = require('./utils/logger');
// src/app.js
// Express app — exports app without calling .listen()
// root index.js calls app.listen()
require('dotenv').config();
const express = require('express');
const { getQueueStatus } = require('./services/bookingService');
const prisma = require('./database/prisma');

const app = express();

app.use(express.json());
app.use(express.static('public'));

// ── Rate limiter (DB) ──────────────────────────────────
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60;

async function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const endpoint = 'api_global';
  const now = new Date();

  try {
    // Delete expired entries sporadically
    if (Math.random() < 0.1) {
      await prisma.rateLimitEntry.deleteMany({
        where: { expiresAt: { lt: now } }
      });
    }

    const entry = await prisma.rateLimitEntry.upsert({
      where: {
        ip_endpoint: { ip, endpoint }
      },
      update: {
        hits: { increment: 1 }
      },
      create: {
        ip,
        endpoint,
        hits: 1,
        expiresAt: new Date(now.getTime() + RATE_LIMIT_WINDOW)
      }
    });

    if (entry.hits > MAX_REQUESTS) {
      if (entry.expiresAt < now) {
        // Reset if expired but we hit it exactly
        await prisma.rateLimitEntry.update({
          where: { ip_endpoint: { ip, endpoint } },
          data: { hits: 1, expiresAt: new Date(now.getTime() + RATE_LIMIT_WINDOW) }
        });
        return next();
      }
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  } catch (error) {
    logger.error('Rate Limiter Error:', error);
    next(); // Fallback allow
  }
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
