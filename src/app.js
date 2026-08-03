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

// ── Bot-internal notification endpoint (called by dashboard to send
//    patient notifications when a schedule is closed, etc.) ──────────
//    Header: Authorization: Bearer <BOT_API_SECRET>
//    Body: { chatIds: string[], text: string }
app.post('/api/notify', async (req, res) => {
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.BOT_API_SECRET}`;
  if (auth !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { chatIds, text } = req.body || {};
  if (!Array.isArray(chatIds) || chatIds.length === 0 || typeof text !== 'string') {
    return res.status(400).json({ error: 'invalid_input', message: 'chatIds (string[]) and text (string) required' });
  }
  // The bot instance is attached to req.app by index.js
  const bot = req.app.get('bot');
  if (!bot) {
    return res.status(503).json({ error: 'bot_unavailable', message: 'Bot instance not attached to app' });
  }
  const results = [];
  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(String(chatId), text, { parse_mode: 'Markdown' });
      results.push({ chatId, ok: true });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }
  return res.json({ ok: true, results });
});

module.exports = app;
