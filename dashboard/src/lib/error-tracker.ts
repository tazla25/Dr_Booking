// /home/z/my-project/src/lib/error-tracker.ts (Task 5.3)
import { NextRequest } from 'next/server'
interface ErrorContext { userId?: string; [key: string]: unknown }
export async function reportError(error: Error | unknown, req?: NextRequest, context: ErrorContext = {}) {
  const err = error instanceof Error ? error : new Error(String(error))
  const ctx: ErrorContext = { ...context, url: req?.url, method: req?.method, ip: req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim(), userAgent: req?.headers.get('user-agent'), timestamp: new Date().toISOString() }
  console.error('[error-tracker]', err.message, { stack: err.stack, ...ctx })
  const webhookUrl = process.env.ERROR_WEBHOOK_URL
  if (webhookUrl) {
    try {
      const payload = { text: `🚨 *Dr_Booking Dashboard Error*`, attachments: [{ color: 'danger', fields: [{ title: 'Message', value: err.message, short: false }, ...(ctx.url ? [{ title: 'URL', value: ctx.url, short: false }] : []), { title: 'Timestamp', value: ctx.timestamp as string, short: true }], text: '```' + (err.stack || err.message).split('\n').slice(0, 15).join('\n') + '```' }] }
      fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
    } catch { /* ignore */ }
  }
}
export async function reportClientError(error: Error, info: { componentStack?: string }, url?: string) {
  try { await fetch('/api/_error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: error.message, stack: error.stack, componentStack: info.componentStack, url }) }) } catch { /* ignore */ }
}
