// /home/z/my-project/src/lib/bot-notify.ts
//
// Shared helper for sending WhatsApp messages to patients via the bot's
// /api/notify endpoint. Used by:
//   - appointment confirm flow (send token + tracking link)
//   - appointment cancellation (notify patient)
//   - appointment reschedule (notify patient of new date + token)
//   - schedule closure (notify affected patients)
//   - doctor verification (notify doctor of approval/rejection)
//
// All calls are best-effort (fire-and-forget). A failure to notify does NOT
// fail the parent API call — we just log the error.

export interface NotifyResult {
  ok: boolean
  error?: string
}

// V3-006 fix: optional pre-approved WhatsApp template. If the free-text
// send fails because the 24-hour conversation window expired, the bot's
// /api/notify endpoint will fall back to this template (the same pattern
// reminderJob.js uses). The template must be approved in Meta Business
// Manager before it can be sent.
export interface NotifyTemplate {
  name: string // e.g. 'appointment_confirmed'
  language?: string // 'bn' | 'en' | 'hi' (default 'bn')
  components?: unknown[] // Prisma-shaped components array
}

/**
 * Send a WhatsApp message to one or more patients via the bot.
 *
 * @param chatIds   - array of patient phone numbers (E.164 or local format)
 * @param text      - message body (WhatsApp Markdown: *bold*, _italic_)
 * @param template  - optional pre-approved template to fall back to if the
 *                    free-text send fails outside the 24-hour window
 * @returns NotifyResult
 */
export async function notifyPatients(
  chatIds: string[],
  text: string,
  template?: NotifyTemplate
): Promise<NotifyResult> {
  if (!Array.isArray(chatIds) || chatIds.length === 0 || !text) {
    return { ok: false, error: 'invalid_input' }
  }

  const botUrl = process.env.BOT_API_URL || process.env.PUBLIC_URL || process.env.DASHBOARD_URL
  if (!botUrl || !process.env.BOT_API_SECRET) {
    console.warn('[bot-notify] BOT_API_URL or BOT_API_SECRET not set — skipping notification')
    return { ok: false, error: 'not_configured' }
  }

  let lastError: Error | null = null;
  let delay = 1000;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${botUrl.replace(/\/$/, '')}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.BOT_API_SECRET}`,
        },
        body: JSON.stringify({ chatIds, text, template }),
      })
      if (!res.ok) {
        const status = res.status;
        const body = await res.text().catch(() => '')

        // Don't retry on client errors (except 429)
        if (status >= 400 && status < 500 && status !== 429) {
          console.error(`[bot-notify] bot returned ${status}: ${body}`)
          return { ok: false, error: `bot_http_${status}` }
        }

        throw new Error(`bot_http_${status}`);
      }
      return { ok: true }
    } catch (err) {
      lastError = err as Error;
      console.warn(`[bot-notify] fetch failed (attempt ${attempt}/3):`, lastError.message);

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  console.error('[bot-notify] fetch failed after retries:', lastError);
  return { ok: false, error: lastError?.message || 'unknown_error' }
}

/**
 * Look up a patient's language preference from their BotSession row.
 * Reads from sessionData JSON first (most up-to-date), then falls back to
 * the `lang` column, then defaults to 'bn'.
 */
export async function getPatientLang(phone: string, db: import('@prisma/client').PrismaClient): Promise<string> {
  try {
    const session = await db.botSession.findUnique({
      where: { chatId: String(phone) },
      select: { lang: true, sessionData: true },
    })
    if (!session) return 'bn'
    if (session.sessionData) {
      try {
        const parsed = JSON.parse(session.sessionData)
        if (parsed.lang) return parsed.lang
      } catch { /* ignore */ }
    }
    return session.lang || 'bn'
  } catch {
    return 'bn'
  }
}

// V3-009 fix: centralized confirmation message builder. The confirm route
// and any future caller (e.g. a re-send button on the dashboard) share
// this single source of truth so the message can't drift out of sync
// with the bot's APPT_CONFIRMED_TRACKER message.
export function buildConfirmedMessage(opts: {
  patientName: string
  appointmentDate: string
  queueNumber: number
  scheduleId: string
  lang: string
}): { text: string; trackerUrl: string; template?: NotifyTemplate } {
  const { patientName, appointmentDate, queueNumber, scheduleId, lang } = opts
  const trackerUrl = `${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${scheduleId}&date=${appointmentDate}`
  let text: string
  if (lang === 'en') {
    text = `✅ *Appointment Confirmed!*\n\n👤 Name: ${patientName}\n📅 Date: ${appointmentDate}\n🔢 Your Token: *#${queueNumber}*\n\nSee live queue status:\n${trackerUrl}`
  } else if (lang === 'hi') {
    text = `✅ *अपॉइंटमेंट की पुष्टि हुई!*\n\n👤 नाम: ${patientName}\n📅 तारीख: ${appointmentDate}\n🔢 आपका टोकन: *#${queueNumber}*\n\nलाइव कतार स्थिति देखें:\n${trackerUrl}`
  } else {
    text = `✅ *অ্যাপয়েন্টমেন্ট নিশ্চিত!*\n\n👤 নাম: ${patientName}\n📅 তারিখ: ${appointmentDate}\n🔢 আপনার টোকেন: *#${queueNumber}*\n\nলাইভ কিউ স্ট্যাটাস দেখুন:\n${trackerUrl}`
  }
  // V3-006: pass a pre-approved template so the bot can fall back to it
  // if the free-text send fails outside the 24-hour window. The template
  // must be approved in Meta Business Manager — see WHATSAPP_TEMPLATES.md.
  // If it isn't approved yet, the free-text send is still attempted first
  // and the template fallback is a no-op (the bot logs the failure).
  const template: NotifyTemplate = {
    name: 'appointment_confirmed',
    language: lang === 'en' ? 'en' : 'bn',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: patientName },
          { type: 'text', text: appointmentDate },
          { type: 'text', text: String(queueNumber) },
          { type: 'text', text: trackerUrl },
        ],
      },
    ],
  }
  return { text, trackerUrl, template }
}

// V3-004 helper: centralized reschedule message builder (mirrors the
// inline version in reschedule/route.ts so the message stays consistent
// if we ever add a re-send path).
export function buildRescheduledMessage(opts: {
  newDate: string
  queueNumber: number
  scheduleId: string
  lang: string
}): { text: string; trackerUrl: string; template?: NotifyTemplate } {
  const { newDate, queueNumber, scheduleId, lang } = opts
  const trackerUrl = `${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${scheduleId}&date=${newDate}`
  let text: string
  if (lang === 'en') {
    text = `📅 *Appointment Rescheduled*\n\nYour appointment has been moved to *${newDate}*.\n🔢 New Token: *#${queueNumber}*\n\nLive queue status:\n${trackerUrl}`
  } else if (lang === 'hi') {
    text = `📅 *अपॉइंटमेंट री-शेड्यूल*\n\nआपका अपॉइंटमेंट *${newDate}* को बदल दिया गया है।\n🔢 नया टोकन: *#${queueNumber}*\n\nलाइव कतार स्थिति:\n${trackerUrl}`
  } else {
    text = `📅 *অ্যাপয়েন্টমেন্ট পুনঃনির্ধারিত*\n\nআপনার অ্যাপয়েন্টমেন্ট *${newDate}* তে পরিবর্তন করা হয়েছে।\n🔢 নতুন টোকেন: *#${queueNumber}*\n\nলাইভ কিউ স্ট্যাটাস:\n${trackerUrl}`
  }
  const template: NotifyTemplate = {
    name: 'appointment_rescheduled',
    language: lang === 'en' ? 'en' : 'bn',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: newDate },
          { type: 'text', text: String(queueNumber) },
          { type: 'text', text: trackerUrl },
        ],
      },
    ],
  }
  return { text, trackerUrl, template }
}
