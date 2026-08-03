// src/platforms/whatsapp.js
// WhatsApp Cloud API adapter (Task 3.2)
const Platform = require('./index');
const axios = require('axios');

class WhatsAppPlatform extends Platform {
  constructor() {
    super();
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    this._configured = !!(this.phoneNumberId && this.accessToken);
  }
  _ensureConfigured() {
    if (!this._configured) throw new Error('WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.');
  }
  async send(userId, text, options = {}) {
    this._ensureConfigured();
    const r = await axios.post(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: String(userId).replace(/^\+/, ''), type: 'text', text: { body: text } },
      { headers: { Authorization: `Bearer ${this.accessToken}` } });
    return r.data;
  }
  async sendInlineKeyboard(userId, text, keyboard, options = {}) {
    this._ensureConfigured();
    const buttons = keyboard.flat().slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.callback_data, title: b.text.substring(0, 20) } }));
    if (buttons.length === 0) return this.send(userId, text, options);
    const r = await axios.post(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: String(userId).replace(/^\+/, ''), type: 'interactive', interactive: { type: 'button', body: { text }, action: { buttons } } },
      { headers: { Authorization: `Bearer ${this.accessToken}` } });
    return r.data;
  }
  async sendPhoto(userId, photoUrl, caption) {
    this._ensureConfigured();
    const r = await axios.post(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: String(userId).replace(/^\+/, ''), type: 'image', image: { link: photoUrl, caption: caption || undefined } },
      { headers: { Authorization: `Bearer ${this.accessToken}` } });
    return r.data;
  }
  async answerCallback(_callbackId) { /* WhatsApp has no callback queries */ }
  async registerWebhook(app, path, handler) {
    app.get(path, (req, res) => {
      if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === this.verifyToken) return res.status(200).send(req.query['hub.challenge']);
      return res.sendStatus(403);
    });
    app.post(path, (req, res) => { const p = this.parseIncomingUpdate(req.body); if (p) handler(p); res.sendStatus(200); });
  }
  async setWebhook(_url) { /* WhatsApp webhooks are configured in Meta dashboard */ }
  parseIncomingUpdate(update) {
    const msg = update.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return null;
    return { from: msg.from, text: msg.text?.body || msg.button?.text || '', messageId: msg.id, timestamp: msg.timestamp ? parseInt(msg.timestamp, 10) * 1000 : Date.now(), isCallback: false, raw: msg };
  }
  getMaxButtonsPerRow() { return 3; }
  supportsUrlButtons() { return false; }
}
module.exports = WhatsAppPlatform;
