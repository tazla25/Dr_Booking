// /home/z/my-project/src/lib/magic-link.ts
// Bot-driven Magic Link token generation and verification.
//
// Design:
//  - Raw token = 32 random bytes, hex-encoded (64 chars), URL-safe.
//  - DB stores only SHA-256(token) — never the raw token.
//  - Tokens are single-use: marked `usedAt` on consumption.
//  - Default expiry = 2 hours.
//  - The bot calls /api/auth/generate-magic-link with BOT_API_SECRET to obtain a link.

import crypto from 'crypto'
import { db } from './db'

export const MAGIC_LINK_TTL_MINUTES = 120 // 2 hours

/** Generate a cryptographically secure random token (64 hex chars). */
export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Hash a raw token with SHA-256 for safe DB storage. */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Create a magic link for an admin user.
 * Returns the raw token (to embed in the URL) and the DB record.
 */
export async function createMagicLink(adminUserId: string) {
  const rawToken = generateRawToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000)

  const record = await db.magicLink.create({
    data: {
      tokenHash,
      adminUserId,
      expiresAt,
    },
  })

  return { rawToken, record }
}

/**
 * Verify a raw token from a magic link URL.
 * On success: marks the link as used, returns the admin user.
 * On failure: returns an error code.
 */
export async function consumeMagicLink(
  rawToken: string,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<
  | { ok: true; user: Awaited<ReturnType<typeof db.adminUser.findUnique>> }
  | { ok: false; error: 'invalid' | 'expired' | 'used' | 'not_found' }
> {
  if (!rawToken || rawToken.length !== 64) {
    return { ok: false, error: 'invalid' }
  }

  const tokenHash = hashToken(rawToken)
  const link = await db.magicLink.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  })

  if (!link) return { ok: false, error: 'not_found' }
  if (link.usedAt) return { ok: false, error: 'used' }
  if (link.expiresAt < new Date()) return { ok: false, error: 'expired' }
  if (!link.adminUser || !link.adminUser.isActive) {
    return { ok: false, error: 'not_found' }
  }

  // Single-use: mark as consumed (with IP/UA for audit)
  await db.magicLink.update({
    where: { id: link.id },
    data: {
      usedAt: new Date(),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
  })

  // Update lastLoginAt
  await db.adminUser.update({
    where: { id: link.adminUser.id },
    data: { lastLoginAt: new Date() },
  })

  return { ok: true, user: link.adminUser }
}

/** Constant-time string comparison to prevent timing attacks on token lookup. */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** Validate the BOT_API_SECRET sent by the Telegram/WhatsApp bot. */
export function validateBotSecret(authHeader: string | null): boolean {
  const expected = process.env.BOT_API_SECRET
  if (!expected) return false
  if (!authHeader) return false
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return false
  return constantTimeCompare(match[1].trim(), expected)
}

/** Build the public magic link URL. */
export function buildMagicLinkUrl(rawToken: string): string {
  const base = process.env.MAGIC_LINK_BASE_URL || process.env.PUBLIC_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/auth/verify?token=${rawToken}`
}
