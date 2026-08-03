// /home/z/my-project/src/app/api/me/failed-logins/route.ts
//
// Phase 1 reform: email is optional now (phone is the primary identifier).
// Falls back to the user's email if provided, otherwise returns zero failures.
import { NextRequest } from 'next/server'
import { getCurrentUser, getFailedAttempts } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  // Prefer the query param, then the user's email, then a sentinel that matches nothing
  const email = url.searchParams.get('email') || user.email || '__no_email__'
  const count = await getFailedAttempts(email)

  const recent = await db.failedLogin.findMany({
    where: { email },
    orderBy: { attemptedAt: 'desc' },
    take: 10,
  })

  return Response.json({ email, count, recent })
}
