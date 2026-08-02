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



module.exports = app;
