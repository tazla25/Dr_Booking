// index.js — project root entry point
require('dotenv').config();

// ── Validate required environment variables ──────────────────────────
const requiredEnvVars = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('   Copy .env.example to .env and fill in real values.');
    process.exit(1);
  }
}

// Warn about optional but recommended vars
const recommendedEnvVars = ['DASHBOARD_URL', 'BOT_API_SECRET', 'PUBLIC_URL'];
for (const envVar of recommendedEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️  Missing recommended environment variable: ${envVar}`);
  }
}

const app = require('./src/app');
const { createBot, registerWebhook } = require('./src/bot/index');
const { initReminderJob } = require('./src/jobs/reminderJob');
const { initFeedbackJob } = require('./src/jobs/feedbackJob');

const PORT = process.env.PORT || 3000;

const crypto = require('crypto');
const webhookSecret = process.env.WEBHOOK_SECRET || process.env.BOT_API_SECRET || crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest('hex');

const bot = createBot();
// Attach the bot instance to the app so internal endpoints (e.g. /api/notify)
// can use it to send messages without needing a separate bot reference.
app.set('bot', bot);
registerWebhook(bot, app, webhookSecret);
initReminderJob(bot);
initFeedbackJob(bot);

const server = app.listen(PORT, () => {
  console.log(`🚀 Smart Queue Bot running on port ${PORT}`);

  if (process.env.PUBLIC_URL) {
    bot
      .setWebHook(`${process.env.PUBLIC_URL}/webhook`, { secret_token: webhookSecret })
      .then(() => console.log(`✅ Webhook set: ${process.env.PUBLIC_URL}/webhook`))
      .catch((err) => console.error('❌ Webhook error:', err.message));
  }
});

// ── Graceful shutdown ────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('👋 Server closed.');
    process.exit(0);
  });
  // Force exit if server hasn't closed in 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
