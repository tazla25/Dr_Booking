// /home/z/my-project/src/app/api/audit-log/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 200)

  const logs = await db.auditLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      adminUser: {
        select: { name: true, email: true },
      },
    },
  })

  return Response.json({ logs })
}
