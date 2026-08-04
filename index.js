// index.js — project root entry point (WhatsApp-only)
require('dotenv').config();

// ── Validate required environment variables ──────────────────────────
const requiredEnvVars = ['DATABASE_URL', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('   Copy .env.example to .env and fill in real values.');
    process.exit(1);
  }
}

// Warn about optional but recommended vars
const recommendedEnvVars = ['DASHBOARD_URL', 'BOT_API_SECRET', 'PUBLIC_URL', 'WHATSAPP_VERIFY_TOKEN'];
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

const bot = createBot();
// Attach the bot instance to the app so internal endpoints (e.g. /api/notify)
// can use it to send messages without needing a separate bot reference.
app.set('bot', bot);
registerWebhook(bot, app);
initReminderJob(bot);
initFeedbackJob(bot);

const server = app.listen(PORT, () => {
  console.log(`🚀 Dr_Booking WhatsApp Bot running on port ${PORT}`);

  // Set WhatsApp webhook subscription (if PUBLIC_URL is set)
  if (process.env.PUBLIC_URL) {
    const platform = bot._platform;
    if (platform && typeof platform.setWebhook === 'function') {
      platform
        .setWebhook(`${process.env.PUBLIC_URL}/webhook`)
        .then(() => console.log(`✅ WhatsApp webhook subscription checked: ${process.env.PUBLIC_URL}/webhook`))
        .catch((err) => console.error('❌ Webhook subscription error:', err.message));
    }
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
