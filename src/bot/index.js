// src/bot/index.js
// WhatsApp-only bot init and webhook registration.
//
// Phase 2 (WhatsApp migration): Telegram code removed. The bot now uses
// the WhatsApp Cloud API exclusively. The createBot() helper returns a
// thin wrapper that exposes sendMessage / answerCallbackQuery for legacy
// handler code, delegating to the WhatsAppPlatform instance underneath.

const WhatsAppPlatform = require('../platforms/whatsapp');
const { handleMessage, handleCallbackQuery } = require('./handler');

/**
 * Create the WhatsApp platform instance.
 */
function createPlatform() {
  return new WhatsAppPlatform();
}

/**
 * Create a bot instance. Backward-compatible: returns an object that
 * exposes sendMessage + answerCallbackQuery so legacy handler code can
 * keep calling bot.sendMessage(...) without knowing about platforms.
 */
function createBot() {
  const platform = createPlatform();
  return {
    _platform: platform,
    sendMessage: (chatId, text, opts) => platform.send(chatId, text, opts),
    sendInlineKeyboard: (chatId, text, keyboard, opts) =>
      platform.sendInlineKeyboard(chatId, text, keyboard, opts),
    answerCallbackQuery: (callbackId) => platform.answerCallback(callbackId),
  };
}

/**
 * Register the /webhook Express route and attach the message listener.
 * WhatsApp requires both a GET (verification) and POST (incoming) endpoint.
 */
function registerWebhook(bot, app) {
  if (!bot._platform) throw new Error('No platform available on bot instance');
  bot._platform.registerWebhook(app, '/webhook', (update) => {
    if (update.isCallback) {
      handleCallbackQuery(bot, {
        message: { chat: { id: update.from } },
        data: update.callbackData,
        id: update.callbackId,
      });
    } else {
      handleMessage(bot, {
        chat: { id: update.from },
        text: update.text,
      });
    }
  });
}

module.exports = { createBot, createPlatform, registerWebhook };
