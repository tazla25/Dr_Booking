// src/platforms/multi.js
// Multi-platform broadcaster (Task 3.1) — for migration period
const Platform = require('./index');

class MultiPlatform extends Platform {
  constructor(platforms) { super(); this.platforms = platforms; }
  async send(userId, text, options = {}) {
    return Promise.allSettled(this.platforms.map(p => p.send(userId, text, options)))
      .then(r => r.map((x, i) => ({ platform: this.platforms[i].constructor.name, status: x.status })));
  }
  async sendInlineKeyboard(userId, text, keyboard, options = {}) {
    return Promise.allSettled(this.platforms.map(p => p.sendInlineKeyboard(userId, text, keyboard, options)))
      .then(r => r.map((x, i) => ({ platform: this.platforms[i].constructor.name, status: x.status })));
  }
  async sendPhoto(userId, photoUrl, caption) {
    return Promise.allSettled(this.platforms.map(p => p.sendPhoto(userId, photoUrl, caption)))
      .then(r => r.map((x, i) => ({ platform: this.platforms[i].constructor.name, status: x.status })));
  }
  async answerCallback(callbackId) { await Promise.allSettled(this.platforms.map(p => p.answerCallback(callbackId))); }
  async registerWebhook(app, path, handler) {
    await Promise.all(this.platforms.map(async p => {
      const sub = `${path}/${p.constructor.name.toLowerCase().replace('platform', '')}`;
      await p.registerWebhook(app, sub, handler);
    }));
  }
  async setWebhook(url) { await Promise.allSettled(this.platforms.map(p => p.setWebhook(url))); }
  parseIncomingUpdate(update) {
    for (const p of this.platforms) { try { const r = p.parseIncomingUpdate(update); if (r) return r; } catch { /* try next */ } }
    return null;
  }
}
module.exports = MultiPlatform;
