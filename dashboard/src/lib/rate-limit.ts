// /home/z/my-project/src/lib/rate-limit.ts (Task 5.1)
interface Bucket { hits: number; resetAt: number }
const buckets = new Map<string, Bucket>()
if (typeof setInterval !== 'undefined') {
  setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k) }, 5 * 60 * 1000).unref?.()
}
export const RATE_LIMITS = {
  magicLink: { limit: 3, windowMs: 10 * 60 * 1000 },
  appointmentCreate: { limit: 20, windowMs: 60 * 1000 },
  appointmentWalkIn: { limit: 30, windowMs: 60 * 1000 },
  publicQueue: { limit: 30, windowMs: 60 * 1000 },
  authVerify: { limit: 5, windowMs: 10 * 60 * 1000 },
  feedback: { limit: 10, windowMs: 60 * 1000 },
  global: { limit: 60, windowMs: 60 * 1000 },
} as const
export async function rateLimit(identifier: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now()
  const existing = buckets.get(identifier)
  if (!existing || existing.resetAt < now) {
    const resetAt = now + windowMs
    buckets.set(identifier, { hits: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }
  existing.hits++
  if (existing.hits > limit) return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  return { allowed: true, remaining: limit - existing.hits, resetAt: existing.resetAt }
}
export function rateLimitedResponse(resetAt: number, message = 'Too many requests. Please try again later.') {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return Response.json({ error: 'rate_limited', message, retryAfter: retryAfterSec }, { status: 429, headers: { 'Retry-After': String(retryAfterSec), 'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)) } })
}
