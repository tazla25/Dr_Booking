// index.js — project root entry point
require('dotenv').config();
const logger = require('./src/utils/logger');

// ── Validate required environment variables ──────────────────────────
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TELEGRAM_BOT_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    logger.error('Copy .env.example to .env and fill in real values.');
    process.exit(1);
  }
}

const app = require('./src/app');
const { createBot, registerWebhook } = require('./src/bot/index');

const PORT = process.env.PORT || 3000;

const bot = createBot();
registerWebhook(bot, app);

const server = app.listen(PORT, () => {
  logger.info(`🚀 Smart Queue Bot running on port ${PORT}`);

  if (process.env.PUBLIC_URL) {
    bot
      .setWebHook(`${process.env.PUBLIC_URL}/webhook`)
      .then(() => logger.info(`✅ Webhook set: ${process.env.PUBLIC_URL}/webhook`))
      .catch((err) => logger.error({ err }, '❌ Webhook error'));
  }
});

// ── Graceful shutdown ────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`🛑 Received ${signal}. Shutting down gracefully...`);

  if (bot && bot.isPolling()) {
      bot.stopPolling();
  }

  server.close(() => {
    logger.info('👋 Server closed.');
    process.exit(0);
  });
  // Force exit if server hasn't closed in 10 seconds
  setTimeout(() => {
    logger.error('⚠️ Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
