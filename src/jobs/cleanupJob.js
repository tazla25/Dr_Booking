// src/jobs/cleanupJob.js
//
// NEW-007 fix: dedicated hourly cron for DB housekeeping. Previously the
// rate_limits table was cleaned stochastically (10% of requests), which
// caused random latency spikes — and there was NO cleanup at all for
// expired magic_links, expired sessions, or old failed_logins rows. Over
// time these tables grow unbounded.
//
// This job runs once per hour and purges:
//   - rate_limits rows past their expiresAt
//   - magic_links rows past their expiresAt (single-use tokens, expired)
//   - sessions rows past their expiresAt (idle-timeout sessions)
//   - failed_logins rows older than 24 hours (lockout window is 15 min)
//
// All deletes are fire-and-forget with logged errors — a failed cleanup
// run must not crash the bot.
const cron = require('node-cron');
const prisma = require('../database/prisma');
const logger = require('../utils/logger');

function initCleanupJob() {
  // Top of every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running DB cleanup cron job...');
    const now = new Date();
    const failedLoginsCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const tasks = [
      ['rate_limits', () => prisma.rateLimitEntry.deleteMany({ where: { expiresAt: { lt: now } } })],
      ['magic_links', () => prisma.magicLink.deleteMany({ where: { expiresAt: { lt: now } } })],
      ['sessions',    () => prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })],
      ['failed_logins', () => prisma.failedLogin.deleteMany({ where: { attemptedAt: { lt: failedLoginsCutoff } } })],
    ];

    for (const [name, run] of tasks) {
      try {
        const result = await run();
        if (result && typeof result.count === 'number' && result.count > 0) {
          logger.info({ table: name, deleted: result.count }, 'cleanup: deleted rows');
        }
      } catch (err) {
        // P2025 = table missing (migration not run yet) — log as warn, not error
        const code = err && err.code;
        if (code === 'P2025' || code === 'P2021' || code === 'P2022') {
          logger.warn({ table: name, code }, 'cleanup: table not ready (migration pending?)');
        } else {
          logger.error({ table: name, err: err.message, code }, 'cleanup: failed');
        }
      }
    }
  });
  logger.info('DB cleanup cron scheduled (hourly at minute 0)');
}

module.exports = { initCleanupJob };
