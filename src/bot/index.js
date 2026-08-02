// src/bot/index.js
// Telegram bot init and webhook registration.
const TelegramBot = require('node-telegram-bot-api');
const { handleMessage, handleCallbackQuery } = require('./handler');

/**
 * Create a Telegram bot instance (webhook mode — no polling).
 */
function createBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  return bot;
}

/**
 * Register the /webhook Express route and attach the message listener.
 * Telegram will POST updates to PUBLIC_URL/webhook.
 *
 * @param {TelegramBot} bot
 * @param {Express} app
 */
function registerWebhook(bot, app, secretToken) {
  app.post('/webhook', (req, res) => {
    if (secretToken && req.headers['x-telegram-bot-api-secret-token'] !== secretToken) {
      return res.status(403).send('Forbidden');
    }
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  bot.on('message', (msg) => handleMessage(bot, msg));
  bot.on('callback_query', (query) => handleCallbackQuery(bot, query));
}

module.exports = { createBot, registerWebhook };
