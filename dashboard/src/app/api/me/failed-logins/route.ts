// /home/z/my-project/src/app/api/me/failed-logins/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser, getFailedAttempts } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const email = url.searchParams.get('email') || user.email
  const count = await getFailedAttempts(email)

  const recent = await db.failedLogin.findMany({
    where: { email },
    orderBy: { attemptedAt: 'desc' },
    take: 10,
  })

  return Response.json({ email, count, recent })
}
