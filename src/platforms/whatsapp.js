// src/platforms/whatsapp.js
// WhatsApp Cloud API adapter (production-ready).
//
// Phase 2 (WhatsApp migration): enhanced with full button/list support,
// proper E.164 normalization, callback parsing for interactive replies,
// and a non-failing setWebhook (the URL itself must be configured in
// Meta Business Manager — this method only logs the intended URL).

const axios = require('axios');
const Platform = require('./index');

class WhatsAppPlatform extends Platform {
  constructor() {
    super();
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID required');
    }
    if (!process.env.WHATSAPP_ACCESS_TOKEN) {
      throw new Error('WHATSAPP_ACCESS_TOKEN required');
    }
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'drb_verify_2026';
    this.apiBase = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
  }

  // ── Send plain text ───────────────────────────────────────────────
  async send(userId, text, _options = {}) {
    const body = {
      messaging_product: 'whatsapp',
      to: this.normalizePhone(userId),
      type: 'text',
      text: { body: String(text).substring(0, 4096) },
    };
    return this._send(body);
  }

  // ── Send inline keyboard (≤3 buttons → button type, >3 → list) ────
  async sendInlineKeyboard(userId, text, keyboard, _options = {}) {
    const rows = Array.isArray(keyboard) ? keyboard.filter((r) => Array.isArray(r) && r.length > 0) : [];
    const buttons = rows.flat().slice(0, 10); // list supports up to 10 rows per section

    if (buttons.length === 0) {
      return this.send(userId, text, _options);
    }

    // WhatsApp "button" type supports max 3 buttons
    if (buttons.length <= 3) {
      const body = {
        messaging_product: 'whatsapp',
        to: this.normalizePhone(userId),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: String(text).substring(0, 1024) },
          action: {
            buttons: buttons.map((b) => ({
              type: 'reply',
              reply: {
                id: String(b.callback_data || b.id || '').substring(0, 256),
                title: String(b.text || b.title || '').substring(0, 20),
              },
            })),
          },
        },
      };
      return this._send(body);
    }

    // For >3 buttons, use list type (max 10 rows per section, 1 section is enough for our use case)
    const sections = [
      {
        title: 'Options',
        rows: buttons.map((b) => ({
          id: String(b.callback_data || b.id || '').substring(0, 256),
          title: String(b.text || b.title || '').substring(0, 24),
          description: String(b.description || '').substring(0, 72),
        })),
      },
    ];

    const body = {
      messaging_product: 'whatsapp',
      to: this.normalizePhone(userId),
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Dr_Booking' },
        body: { text: String(text).substring(0, 1024) },
        action: { button: 'Choose', sections },
      },
    };
    return this._send(body);
  }

  // ── Send photo with optional caption ──────────────────────────────
  async sendPhoto(userId, photoUrl, caption) {
    const body = {
      messaging_product: 'whatsapp',
      to: this.normalizePhone(userId),
      type: 'image',
      image: {
        link: photoUrl,
        caption: caption ? String(caption).substring(0, 1024) : undefined,
      },
    };
    return this._send(body);
  }

  // ── Send a pre-approved template message (Feature 3) ──────────────
  //
  // Use this for business-initiated messages outside the 24-hour window.
  // The template must be created and approved in Meta Business Manager.
  //
  // @param {string} userId - phone number (E.164 or digits-only)
  // @param {string} templateName - e.g. 'appointment_reminder_1h'
  // @param {string} language - 'bn' or 'en'
  // @param {Array} components - Prisma-shaped components array:
  //   [{ type: 'body', parameters: [{ type: 'text', text: 'value' }, ...] }]
  //   Optional: also include a 'header' component if the template has a header.
  async sendTemplate(userId, templateName, language, components = []) {
    const body = {
      messaging_product: 'whatsapp',
      to: this.normalizePhone(userId),
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    };
    return this._send(body);
  }

  // ── Callbacks (no-op — WhatsApp handles these inline) ─────────────
  async answerCallback(_callbackId) {
    // WhatsApp has no separate "answer callback query" call — the reply
    // is delivered as a new message. No-op here.
  }

  // ── Webhook registration (GET verify + POST receive) ──────────────
  async registerWebhook(app, path, handler) {
    // GET endpoint for webhook verification (Meta requirement)
    app.get(path, (req, res) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === this.verifyToken) {
        console.log('✅ WhatsApp webhook verified');
        return res.status(200).send(challenge);
      }
      return res.sendStatus(403);
    });

    // POST endpoint for receiving messages
    app.post(path, (req, res) => {
      try {
        const parsed = this.parseIncomingUpdate(req.body);
        if (parsed) {
          handler(parsed);
        }
        // Always return 200 quickly (Meta requirement to prevent retries)
        res.sendStatus(200);
      } catch (error) {
        console.error('Webhook parse error:', error.message);
        // Still return 200 to prevent Meta from retrying
        res.sendStatus(200);
      }
    });
  }

  // ── Webhook subscription (info-only; URL must be set in Meta dashboard)
  async setWebhook(url) {
    const appId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!appId) {
      console.warn('⚠️ WHATSAPP_BUSINESS_ACCOUNT_ID not set — skipping webhook subscription log');
      return;
    }
    console.log(`ℹ️  WhatsApp webhook URL: ${url}`);
    console.log(`ℹ️  Configure this URL in Meta Business Manager → WhatsApp → Configuration → Webhook`);
    console.log(`ℹ️  Subscribe to: messages, message_status, message_delivered`);
  }

  // ── Parse incoming webhook payload ────────────────────────────────
  parseIncomingUpdate(update) {
    const entry = update.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return null;

    // Status updates (delivered, read) — ignore for now
    if (value.statuses && !value.messages) return null;

    const message = value.messages?.[0];
    if (!message) return null;

    const from = message.from; // phone number (E.164 without +)

    // Text message
    if (message.type === 'text') {
      return {
        from: `+${from}`,
        text: message.text?.body || '',
        messageId: message.id,
        timestamp: message.timestamp ? parseInt(message.timestamp, 10) * 1000 : Date.now(),
        isCallback: false,
      };
    }

    // Button reply
    if (message.type === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') {
        return {
          from: `+${from}`,
          text: '',
          messageId: message.id,
          timestamp: message.timestamp ? parseInt(message.timestamp, 10) * 1000 : Date.now(),
          isCallback: true,
          callbackData: interactive.button_reply.id,
          callbackId: message.id,
        };
      }
      if (interactive.type === 'list_reply') {
        return {
          from: `+${from}`,
          text: '',
          messageId: message.id,
          timestamp: message.timestamp ? parseInt(message.timestamp, 10) * 1000 : Date.now(),
          isCallback: true,
          callbackData: interactive.list_reply.id,
          callbackId: message.id,
        };
      }
    }

    // Unsupported message type — return empty so handler can show a fallback
    return {
      from: `+${from}`,
      text: '',
      messageId: message.id,
      timestamp: message.timestamp ? parseInt(message.timestamp, 10) * 1000 : Date.now(),
      isCallback: false,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────
  normalizePhone(userId) {
    // WhatsApp expects digits only (no leading + or 00)
    return String(userId).replace(/[^\d]/g, '');
  }

  getMaxButtonsPerRow() { return 3; }
  supportsUrlButtons() { return false; }

  async _send(body) {
    let lastError = null;
    let delay = 1000;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post(this.apiBase, body, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        return response.data;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;

        // Don't retry on 400 Bad Request or 401 Unauthorized (unlikely to succeed on retry)
        if (status === 400 || status === 401) {
          break;
        }

        console.warn(`WhatsApp API error (attempt ${attempt}/3):`, error.response?.data || error.message);

        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }

    const errData = lastError.response?.data;
    console.error('WhatsApp API final error:', errData || lastError.message);
    throw new Error(`WhatsApp send failed: ${errData?.error?.message || lastError.message}`, { cause: lastError });
  }
}

module.exports = WhatsAppPlatform;
