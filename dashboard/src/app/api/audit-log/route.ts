// /home/z/my-project/src/app/api/audit-log/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 200)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0
  const action = url.searchParams.get('action') || undefined
  const adminUserId = url.searchParams.get('adminUserId') || undefined

  const where = {
    ...(action ? { action } : {}),
    ...(adminUserId ? { adminUserId } : {}),
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        adminUser: {
          select: { name: true, email: true },
        },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return Response.json({ logs, total, limit, offset })
}
