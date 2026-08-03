// src/platforms/telegram.js
const TelegramBot = require('node-telegram-bot-api');
const Platform = require('./index');

class TelegramPlatform extends Platform {
  constructor() {
    super();
    if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN required');
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  }
  async send(userId, text, options = {}) {
    return this.bot.sendMessage(String(userId), text, { parse_mode: options.parse_mode || 'Markdown', ...options });
  }
  async sendInlineKeyboard(userId, text, keyboard, options = {}) {
    return this.bot.sendMessage(String(userId), text, { parse_mode: options.parse_mode || 'Markdown', reply_markup: { inline_keyboard: keyboard }, ...options });
  }
  async sendPhoto(userId, photoUrl, caption) {
    return this.bot.sendPhoto(String(userId), photoUrl, caption ? { caption } : undefined);
  }
  async answerCallback(callbackId) {
    if (!callbackId) return;
    try { await this.bot.answerCallbackQuery(callbackId); } catch { /* ignore */ }
  }
  async registerWebhook(app, path, handler) {
    const secretToken = process.env.WEBHOOK_SECRET || process.env.BOT_API_SECRET || require('crypto').createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest('hex');
    app.post(path, (req, res) => {
      if (secretToken && req.headers['x-telegram-bot-api-secret-token'] !== secretToken) return res.status(403).send('Forbidden');
      this.bot.processUpdate(req.body);
      res.sendStatus(200);
    });
    this.bot.on('message', (msg) => { const p = this.parseIncomingUpdate({ message: msg }); if (p) handler(p); });
    this.bot.on('callback_query', (q) => { const p = this.parseIncomingUpdate({ callback_query: q }); if (p) handler(p); });
  }
  async setWebhook(url) {
    const secretToken = process.env.WEBHOOK_SECRET || process.env.BOT_API_SECRET || require('crypto').createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest('hex');
    return this.bot.setWebHook(url, { secret_token: secretToken });
  }
  parseIncomingUpdate(update) {
    if (update.message) {
      const m = update.message;
      return { from: String(m.chat.id), text: m.text || '', messageId: String(m.message_id), timestamp: m.date ? m.date * 1000 : Date.now(), isCallback: false, raw: m };
    }
    if (update.callback_query) {
      const q = update.callback_query;
      return { from: String(q.message.chat.id), text: '', messageId: String(q.message.message_id), timestamp: Date.now(), callbackData: q.data, callbackId: q.id, isCallback: true, raw: q };
    }
    return null;
  }
  getRawBot() { return this.bot; }
}
module.exports = TelegramPlatform;
