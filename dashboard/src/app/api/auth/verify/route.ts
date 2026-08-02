// /home/z/my-project/src/app/api/auth/verify/route.ts
//
// Bot-First Auth — Magic Link Verification
// ========================================
//
// Called by the /auth/verify page (client-side) after the user clicks
// the magic link they received via Telegram.
//
// Flow:
//   1. User clicks https://our-domain.com/auth/verify?token=XYZ
//   2. The /auth/verify page renders, extracts `token` from the URL
//   3. The page POSTs to this endpoint with { token }
//   4. This endpoint:
//        - Validates the token (hash → DB lookup → not expired → not used)
//        - Marks the token as single-use (sets usedAt)
//        - Sets the HTTP-only session cookie (drb_session)
//        - Returns success
//   5. The page redirects to /?view=dashboard

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { consumeMagicLink } from '@/lib/magic-link'
import { createSessionForUser, getIpAddress, getUserAgent } from '@/lib/auth'

const bodySchema = z.object({
  token: z.string().min(64).max(64),
})

export async function POST(req: NextRequest) {
  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'invalid_token',
        message: 'The token format is invalid.',
      },
      { status: 400 }
    )
  }

  const result = await consumeMagicLink(parsed.token, {
    ipAddress: getIpAddress(req),
    userAgent: getUserAgent(req),
  })

  if (!result.ok || !result.user) {
    const messages: Record<string, string> = {
      invalid: 'The token is malformed or truncated.',
      expired: 'This magic link has expired. Please request a new one from the bot.',
      used: 'This magic link has already been used. Each link works only once.',
      not_found: 'This magic link is invalid or the account no longer exists.',
    }
    return Response.json(
      {
        ok: false,
        error: result?.error || 'not_found',
        message: messages[result?.error || 'not_found'] || 'Verification failed.',
      },
      { status: 401 }
    )
  }

  // Set the session cookie (HTTP-only, secure)
  await createSessionForUser(result.user.id, {
    ipAddress: getIpAddress(req),
    userAgent: getUserAgent(req),
  })

  return Response.json({
    ok: true,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    },
  })
}
