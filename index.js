// index.js — project root entry point
require('dotenv').config();

// ── Validate required environment variables ──────────────────────────
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TELEGRAM_BOT_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('   Copy .env.example to .env and fill in real values.');
    process.exit(1);
  }
}

const app = require('./src/app');
const { createBot, registerWebhook } = require('./src/bot/index');
const { initReminderJob } = require('./src/jobs/reminderJob');

const PORT = process.env.PORT || 3000;

const bot = createBot();
registerWebhook(bot, app);
initReminderJob(bot);

const server = app.listen(PORT, () => {
  console.log(`🚀 Smart Queue Bot running on port ${PORT}`);

  if (process.env.PUBLIC_URL) {
    bot
      .setWebHook(`${process.env.PUBLIC_URL}/webhook`)
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
