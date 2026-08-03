// src/platforms/index.js
// Platform abstraction base class (Task 3.1)
class Platform {
  async send(userId, text, options = {}) { throw new Error('Not implemented: send()') }
  async sendInlineKeyboard(userId, text, keyboard, options = {}) { throw new Error('Not implemented: sendInlineKeyboard()') }
  async sendPhoto(userId, photoUrl, caption) { throw new Error('Not implemented: sendPhoto()') }
  async answerCallback(callbackId) { /* no-op default */ }
  async registerWebhook(app, path, handler) { throw new Error('Not implemented: registerWebhook()') }
  async setWebhook(url) { /* no-op default */ }
  parseIncomingUpdate(update) { throw new Error('Not implemented: parseIncomingUpdate()') }
  getMaxButtonsPerRow() { return 8 }
  supportsUrlButtons() { return true }
}
module.exports = Platform;
