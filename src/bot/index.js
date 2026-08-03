// src/bot/index.js
// Bot init and webhook registration.
//
// Phase 1 reform (Task 3.1): Uses platform abstraction layer.
// PLATFORM env var: 'telegram' (default) | 'whatsapp' | 'both'
const TelegramBot = require('node-telegram-bot-api');
const TelegramPlatform = require('../platforms/telegram');
const WhatsAppPlatform = require('../platforms/whatsapp');
const MultiPlatform = require('../platforms/multi');
const { handleMessage, handleCallbackQuery } = require('./handler');

/**
 * Create the appropriate platform instance based on PLATFORM env var.
 */
function createPlatform() {
  const platform = (process.env.PLATFORM || 'telegram').toLowerCase();
  if (platform === 'telegram') return new TelegramPlatform();
  if (platform === 'whatsapp') return new WhatsAppPlatform();
  if (platform === 'both') return new MultiPlatform([new TelegramPlatform(), new WhatsAppPlatform()]);
  throw new Error(`Unknown PLATFORM: ${platform}`);
}

/**
 * Create a Telegram bot instance (webhook mode — no polling).
 * Backward-compatible: returns the raw TelegramBot for legacy code.
 */
function createBot() {
  const platform = createPlatform();
  if (platform.constructor.name === 'TelegramPlatform') return platform.getRawBot();
  // For WhatsApp/Multi: return a stub that delegates to the platform
  return {
    _platform: platform,
    sendMessage: (chatId, text, opts) => platform.send(chatId, text, opts),
    answerCallbackQuery: (callbackId) => platform.answerCallback(callbackId),
  };
}

/**
 * Register the /webhook Express route and attach the message listener.
 */
function registerWebhook(bot, app, secretToken) {
  // If bot has _platform (new abstraction), use its webhook registration
  if (bot._platform) {
    bot._platform.registerWebhook(app, '/webhook', (update) => {
      if (update.isCallback) {
        handleCallbackQuery(bot, { message: { chat: { id: update.from } }, data: update.callbackData, id: update.callbackId });
      } else {
        handleMessage(bot, { chat: { id: update.from }, text: update.text });
      }
    });
    return;
  }

  // Legacy: bot is a real TelegramBot
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

module.exports = { createBot, createPlatform, registerWebhook };
