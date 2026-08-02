// /home/z/my-project/src/app/api/auth/generate-magic-link/route.ts
//
// Bot-First Auth — Magic Link Generation
// =======================================
//
// This endpoint is called ONLY by the Telegram/WhatsApp bot backend.
// It is NOT callable from the browser — it requires BOT_API_SECRET in the
// Authorization header.
//
// Flow:
//   1. Patient/Compounder taps "Open Dashboard" in the Telegram bot.
//   2. Bot backend POSTs to this endpoint with the user's telegramChatId
//      (or whatsappNumber) and the BOT_API_SECRET.
//   3. This endpoint returns a one-time magic link URL.
//   4. Bot forwards the link to the user via Telegram.
//   5. User clicks the link → /auth/verify?token=XYZ → cookie set → dashboard.
//
// Request:
//   POST /api/auth/generate-magic-link
//   Authorization: Bearer <BOT_API_SECRET>
//   Content-Type: application/json
//   { "telegramChatId": "100000001" }
//   // OR
//   { "whatsappNumber": "+8801711000001" }
//
// Response (200):
//   {
//     "magicLink": "https://our-domain.com/auth/verify?token=abc123...",
//     "expiresAt": "2026-07-31T14:30:00.000Z",
//     "user": { "id": "...", "name": "...", "role": "admin" }
//   }
//
// Response (401): Missing/invalid BOT_API_SECRET
// Response (404): No AdminUser matches the given identifier
// Response (423): User is deactivated

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  createMagicLink,
  buildMagicLinkUrl,
  validateBotSecret,
} from '@/lib/magic-link'

const bodySchema = z
  .object({
    telegramChatId: z.string().optional(),
    whatsappNumber: z.string().optional(),
  })
  .refine(
    (d) => d.telegramChatId || d.whatsappNumber,
    { message: 'Either telegramChatId or whatsappNumber must be provided' }
  )

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the bot
    const authHeader = req.headers.get('authorization')
    if (!validateBotSecret(authHeader)) {
      return Response.json(
        { error: 'unauthorized', message: 'Missing or invalid BOT_API_SECRET' },
        { status: 401 }
      )
    }

    // 2. Parse the request body
    let parsed
    try {
      parsed = bodySchema.parse(await req.json())
    } catch (e) {
      return Response.json(
        { error: 'invalid_input', details: (e as Error).message },
        { status: 400 }
      )
    }

    // 3. Look up the AdminUser by telegramChatId OR whatsappNumber
    const where = parsed.telegramChatId
      ? { telegramChatId: parsed.telegramChatId }
      : { whatsappNumber: parsed.whatsappNumber }

    const user = await db.adminUser.findUnique({ where, include: { doctor: true } })

    if (!user) {
      return Response.json(
        {
          error: 'user_not_found',
          message:
            'No admin user is linked to this Telegram chat ID / WhatsApp number. The bot should run onboarding first.',
        },
        { status: 404 }
      )
    }

    if (!user.isActive) {
      return Response.json(
        { error: 'account_disabled', message: 'This account has been deactivated.' },
        { status: 423 }
      )
    }

    // 3.5. Rate limit check: count unused magic links in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const unusedLinksCount = await db.magicLink.count({
      where: {
        adminUserId: user.id,
        usedAt: null,
        createdAt: { gte: tenMinutesAgo },
      },
    })

    if (unusedLinksCount >= 3) {
      return Response.json(
        { error: 'rate_limit_exceeded', message: 'Too many unused magic links. Please wait before requesting another.' },
        { status: 429 }
      )
    }

    // 4. Create the magic link (raw token + hashed DB record)
    const { rawToken, record } = await createMagicLink(user.id)
    const magicLink = buildMagicLinkUrl(rawToken)

    // 5. Audit the generation (without exposing the token)
    await db.auditLog.create({
      data: {
        adminUserId: user.id,
        action: 'magic_link_generated',
        detail: `Magic link generated for ${user.name} (${user.role})`,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0].trim(),
      },
    })

    // 6. Clean up expired unused tokens for this user (housekeeping)
    await db.magicLink.deleteMany({
      where: {
        adminUserId: user.id,
        usedAt: null,
        expiresAt: { lt: new Date() },
      },
    })

    return Response.json({
      magicLink,
      expiresAt: record.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        doctor: user.doctor
          ? { id: user.doctor.id, fullName: user.doctor.fullName }
          : null,
      },
    })
  } catch (error: any) {
    console.error('Magic link generation error:', error)
    return Response.json(
      { error: 'internal_error', message: 'Failed to generate magic link' },
      { status: 500 }
    )
  }
}
