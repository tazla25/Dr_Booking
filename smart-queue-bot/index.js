// index.js — project root entry point
require('dotenv').config();
const app = require('./src/app');
const { createBot, registerWebhook } = require('./src/bot/index');

const PORT = process.env.PORT || 3000;

const bot = createBot();
registerWebhook(bot, app);

app.listen(PORT, () => {
  console.log(`🚀 Smart Queue Bot running on port ${PORT}`);

  if (process.env.PUBLIC_URL) {
    bot
      .setWebHook(`${process.env.PUBLIC_URL}/webhook`)
      .then(() => console.log(`✅ Webhook set: ${process.env.PUBLIC_URL}/webhook`))
      .catch((err) => console.error('❌ Webhook error:', err.message));
  }
});
