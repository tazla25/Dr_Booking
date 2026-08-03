// /home/z/my-project/src/app/api/_error/route.ts (Task 5.3)
import { NextRequest } from 'next/server'
import { rateLimit, rateLimitedResponse } from '@/lib/rate-limit'
import { reportError } from '@/lib/error-tracker'
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = await rateLimit(`clienterr:${ip}`, 10, 60 * 1000)
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt)
  try {
    const body = await req.json()
    const error = new Error(body.message || 'Client error')
    error.stack = body.stack
    await reportError(error, req, { componentStack: body.componentStack, url: body.url })
    return Response.json({ ok: true })
  } catch { return Response.json({ ok: false }, { status: 400 }) }
}
