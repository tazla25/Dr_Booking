// src/platforms/index.js
// Abstract Platform base class.
//
// Phase 2 (WhatsApp migration): this used to dispatch between Telegram
// and WhatsApp. Telegram is gone; the file now only exposes the abstract
// base class that WhatsAppPlatform extends.

class Platform {
  async send(_userId, _text, _options) { throw new Error('Not implemented'); }
  async sendInlineKeyboard(_userId, _text, _keyboard, _options) { throw new Error('Not implemented'); }
  async sendPhoto(_userId, _photoUrl, _caption) { throw new Error('Not implemented'); }
  async registerWebhook(_app, _path, _handler) { throw new Error('Not implemented'); }
  async setWebhook(_url) { throw new Error('Not implemented'); }
  parseIncomingUpdate(_update) { throw new Error('Not implemented'); }
  async answerCallback(_callbackId) { throw new Error('Not implemented'); }
  getMaxButtonsPerRow() { return 3; }
  supportsUrlButtons() { return false; }
}
module.exports = Platform;
