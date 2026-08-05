// /home/z/my-project/src/lib/bot-notify.ts
//
// Shared helper for sending WhatsApp messages to patients via the bot's
// /api/notify endpoint. Used by:
//   - appointment confirm flow (send token + tracking link)
//   - appointment cancellation (notify patient)
//   - schedule closure (notify affected patients)
//   - doctor verification (notify doctor of approval/rejection)
//
// All calls are best-effort (fire-and-forget). A failure to notify does NOT
// fail the parent API call — we just log the error.

export interface NotifyResult {
  ok: boolean
  error?: string
}

/**
 * Send a WhatsApp message to one or more patients via the bot.
 *
 * @param chatIds - array of patient phone numbers (E.164 or local format)
 * @param text   - message body (WhatsApp Markdown: *bold*, _italic_)
 * @returns NotifyResult
 */
export async function notifyPatients(
  chatIds: string[],
  text: string
): Promise<NotifyResult> {
  if (!Array.isArray(chatIds) || chatIds.length === 0 || !text) {
    return { ok: false, error: 'invalid_input' }
  }

  const botUrl = process.env.BOT_API_URL || process.env.PUBLIC_URL || process.env.DASHBOARD_URL
  if (!botUrl || !process.env.BOT_API_SECRET) {
    console.warn('[bot-notify] BOT_API_URL or BOT_API_SECRET not set — skipping notification')
    return { ok: false, error: 'not_configured' }
  }

  try {
    const res = await fetch(`${botUrl.replace(/\/$/, '')}/api/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_API_SECRET}`,
      },
      body: JSON.stringify({ chatIds, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[bot-notify] bot returned ${res.status}: ${body}`)
      return { ok: false, error: `bot_http_${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.error('[bot-notify] fetch failed:', err)
    return { ok: false, error: (err as Error).message }
  }
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
