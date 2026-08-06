// /home/z/my-project/src/lib/auth.ts
// Cookie-based session authentication for the admin dashboard.
//
// Reform (v11 — phone + password):
//   - The bot authenticates users with phone + password (see src/services/adminService.js#authenticateUser).
//   - After successful login, the bot creates a Session row directly in the DB
//     and replies with a one-time dashboard URL of the form
//     /auth/session?sid=<sessionId>&token=<rawToken>.
//   - The /auth/session page validates the session, sets the cookie via
//     createSessionForUser(), and redirects to the dashboard.
//   - All other behaviour (cookie shape, getCurrentUser, RBAC) is unchanged.

import { cookies } from 'next/headers'
import crypto from 'crypto'
import { db } from './db'

export const SESSION_COOKIE = 'drb_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

// HMAC key derived from BOT_API_SECRET for session token signing
function getSessionSecret(): string {
  return process.env.BOT_API_SECRET || 'dev-session-secret-change-me'
}

function hmacToken(token: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(token).digest('hex')
}

export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MINUTES = 15

// ---------- Session creation (called ONLY by /api/auth/verify) ----------

export async function createSessionForUser(
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string }
) {
  const user = await db.adminUser.findUnique({
    where: { id: userId },
    include: {
      ownedDoctor: true,
      delegatedDoctor: { include: { ownerAdmin: true } },
    },
  })
  if (!user || !user.isActive) return null

  await db.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await db.auditLog.create({
    data: {
      adminUserId: user.id,
      action: 'session_login',
      detail: 'Authenticated via WhatsApp bot (phone + password)',
      ipAddress: meta?.ipAddress,
    },
  })

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hmacToken(token)

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min sliding window

  const session = await db.session.create({
    data: {
      adminUserId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, `${session.id}:${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours max
    path: '/',
  })

  return user
}

// ---------- Session reading (used by all protected API routes) ----------

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (!raw) return null

  const separatorIdx = raw.indexOf(':')
  if (separatorIdx === -1) return null

  const sessionId = raw.substring(0, separatorIdx)
  const token = raw.substring(separatorIdx + 1)
  if (!sessionId || !token) return null

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      adminUser: {
        include: {
          ownedDoctor: true,
          delegatedDoctor: { include: { ownerAdmin: true } },
        },
      },
    },
  })

  if (!session) return null

  const user = session.adminUser
  if (!user || !user.isActive) return null

  const absoluteTimeout = new Date(session.createdAt.getTime() + 24 * 60 * 60 * 1000)
  if (new Date() > absoluteTimeout) {
    // Session is older than 24 hours — delete and reject.
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  // Sliding idle timeout: each authenticated request bumps expiresAt by 30 min.
  // If the session has gone idle (no requests for 30 min), expiresAt will be
  // in the past — delete and reject. BUG-004 fix: the previous math
  // (Date.now() - (expiresAt - IDLE_TIMEOUT_MS) > IDLE_TIMEOUT_MS) was a
  // redundant restatement of the absolute check above and obscured the
  // intent. Use the direct comparison instead.
  if (new Date() > session.expiresAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const expectedHash = hmacToken(token)
  const actualBuffer = Buffer.from(session.tokenHash)
  const expectedBuffer = Buffer.from(expectedHash)
  
  if (actualBuffer.length !== expectedBuffer.length) {
    return null
  }
  
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null
  }

  // 4. Update session — bump expiresAt to extend the sliding idle window
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS) },
  })

  return user
}

export async function logout() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (raw) {
    const separatorIdx = raw.indexOf(':')
    if (separatorIdx !== -1) {
      const sessionId = raw.substring(0, separatorIdx)
      if (sessionId) {
        try {
          await db.session.deleteMany({ where: { id: sessionId } })
        } catch (e) {
          console.error('Failed to delete session on logout:', e)
        }
      }
    }
  }
  cookieStore.delete(SESSION_COOKIE)
}

export async function getFailedAttempts(email: string): Promise<number> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000)
  return db.failedLogin.count({
    where: { email, attemptedAt: { gte: since } },
  })
}

export async function recordFailedLogin(email: string, ipAddress?: string, adminUserId?: string) {
  await db.failedLogin.create({
    data: { email, ipAddress, adminUserId },
  })
}

export async function clearFailedLogins(email: string) {
  await db.failedLogin.deleteMany({ where: { email } })
}

export function getIpAddress(req: Request): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return undefined
}

export function getUserAgent(req: Request): string | undefined {
  return req.headers.get('user-agent') || undefined
}
