const logger = require('./utils/logger');
// src/app.js
// Express app — exports app without calling .listen()
// root index.js calls app.listen()
require('dotenv').config();
const express = require('express');
const { getQueueStatus } = require('./services/bookingService');
const prisma = require('./database/prisma');

const app = express();

// NEW-003 fix: trust the first proxy hop so req.ip reflects the real client
// IP when running behind Render/Vercel/Nginx. Without this, every request
// appears to come from the proxy's internal IP (e.g. 127.0.0.1) and the
// rate limiter collapses all users into a single bucket — a single busy
// user can lock out the entire API. Must be set BEFORE the rate limiter.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static('public'));

// ── CORS (BUG-008) ─────────────────────────────────────────────────
// The dashboard talks to its own Next.js API routes server-side, so CORS
// is normally bypassed. But future client-side integrations (or direct
// browser calls to /health or /api/notify) would otherwise be blocked.
// Allow the configured dashboard origin and the same origin (Render).
const ALLOWED_ORIGINS = new Set(
  [process.env.DASHBOARD_URL, process.env.PUBLIC_URL]
    .filter(Boolean)
    .map((u) => u.replace(/\/$/, ''))
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// ── Rate limiter (DB) ──────────────────────────────────
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60;
// NEW-007 fix: deterministic cleanup of expired rate-limit rows. The old
// code ran deleteMany on 10% of all requests, which caused random latency
// spikes. We now run cleanup at most once per minute per process, tracked
// via a module-level timestamp. A dedicated cron job (cleanupJob.js)
// handles the long-tail cleanup of magic_links / sessions / failed_logins.
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 1000;

async function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const endpoint = 'api_global';
  const now = new Date();

  try {
    // Periodic cleanup (at most once per minute)
    if (now.getTime() - lastCleanupAt > CLEANUP_INTERVAL_MS) {
      lastCleanupAt = now.getTime();
      // Fire-and-forget — don't block the response on cleanup
      prisma.rateLimitEntry.deleteMany({ where: { expiresAt: { lt: now } } })
        .catch((e) => logger.warn({ err: e.message }, 'rate_limits cleanup failed'));
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
//    Body: {
//      chatIds: string[],
//      text: string,                    // free-text message (works within 24h window)
//      template?: {                     // optional pre-approved WhatsApp template
//        name: string,                  // e.g. 'appointment_reminder_1h'
//        language: string,              // 'bn' | 'en' | 'hi'
//        components?: Array,            // Prisma-shaped components array
//      },
//    }
//
// V3-006 fix: if a free-text send fails with a 24-hour-window error AND a
// template was provided, fall back to bot._platform.sendTemplate() (the
// same pattern reminderJob.js uses). This is critical for the confirm flow
// — a patient who booked 2 days ago and gets confirmed today would never
// receive their token otherwise.
app.post('/api/notify', async (req, res) => {
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.BOT_API_SECRET}`;
  if (auth !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { chatIds, text, template } = req.body || {};
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
      results.push({ chatId, ok: true, via: 'text' });
    } catch (err) {
      // V3-006: if free-text failed because the 24h conversation window
      // expired and a template was provided, try sending the template.
      const errMsg = String(err.message || '');
      const isWindowError =
        errMsg.includes('24-hour') ||
        errMsg.includes('window') ||
        errMsg.includes('not in allowed list') ||
        errMsg.includes('Recipient phone number');
      if (isWindowError && template && bot._platform && typeof bot._platform.sendTemplate === 'function') {
        try {
          await bot._platform.sendTemplate(
            String(chatId),
            template.name,
            template.language || 'bn',
            template.components || []
          );
          results.push({ chatId, ok: true, via: 'template_fallback' });
          continue;
        } catch (templateErr) {
          results.push({ chatId, ok: false, error: `text_failed: ${errMsg}; template_failed: ${templateErr.message}` });
          continue;
        }
      }
      results.push({ chatId, ok: false, error: errMsg });
    }
  }
  return res.json({ ok: true, results });
});

module.exports = app;
