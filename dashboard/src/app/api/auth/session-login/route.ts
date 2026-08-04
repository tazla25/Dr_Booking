// /home/z/my-project/src/app/api/auth/session-login/route.ts
//
// Feature 1: Direct Session Token Login
// =====================================
//
// Called by the /auth/session page after the user clicks the dashboard link
// the bot sent them. The bot created a Session row directly in the DB after
// verifying the user's password. This endpoint validates that session and
// sets the HTTP-only cookie via createSessionForUser().
//
// Flow:
//   1. User sends /login → phone → password to the WhatsApp bot
//   2. Bot verifies password (bcrypt) and creates a Session row in the DB
//      with tokenHash = HMAC(rawToken, BOT_API_SECRET)
//   3. Bot sends user: DASHBOARD_URL/auth/session?sid=SESSION_ID&token=RAW_TOKEN
//   4. User clicks link → /auth/session page renders → POSTs to this endpoint
//   5. This endpoint:
//        - Looks up the session by ID
//        - Verifies tokenHash matches HMAC(rawToken, BOT_API_SECRET)
//        - Checks session hasn't expired
//        - Calls createSessionForUser() to set the cookie
//        - Deletes the bot-created session (replaced with dashboard-created one)
//   6. Page redirects to /?view=dashboard

import { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { createSessionForUser, getIpAddress, getUserAgent } from '@/lib/auth'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
})

function hmacToken(token: string): string {
  return crypto
    .createHmac('sha256', process.env.BOT_API_SECRET || 'dev-session-secret')
    .update(token)
    .digest('hex')
}

export async function POST(req: NextRequest) {
  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return Response.json(
      { ok: false, error: 'invalid_input', message: 'Missing sessionId or token.' },
      { status: 400 }
    )
  }

  // Look up the session
  const session = await db.session.findUnique({
    where: { id: parsed.sessionId },
    include: { adminUser: true },
  })

  if (!session || !session.adminUser || !session.adminUser.isActive) {
    return Response.json(
      { ok: false, error: 'session_not_found', message: 'Session not found or account deactivated.' },
      { status: 404 }
    )
  }

  // Verify token hash (constant-time comparison)
  const expectedHash = hmacToken(parsed.token)
  const a = Buffer.from(session.tokenHash)
  const b = Buffer.from(expectedHash)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return Response.json(
      { ok: false, error: 'invalid_token', message: 'Invalid session token.' },
      { status: 401 }
    )
  }

  // Check expiry
  if (new Date() > session.expiresAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return Response.json(
      { ok: false, error: 'expired', message: 'Session has expired. Please login again.' },
      { status: 401 }
    )
  }

  // Session is valid — delete it (single-use) and create a new dashboard session
  await db.session.delete({ where: { id: session.id } }).catch(() => {})

  const user = await createSessionForUser(session.adminUser.id, {
    ipAddress: getIpAddress(req),
    userAgent: getUserAgent(req),
  })

  if (!user) {
    return Response.json(
      { ok: false, error: 'user_inactive', message: 'Account is not active.' },
      { status: 403 }
    )
  }

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
  })
}
