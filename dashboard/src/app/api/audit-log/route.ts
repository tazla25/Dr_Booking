// /home/z/my-project/src/app/api/audit-log/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/audit-log?action=&adminUserId=&doctorId=&limit=&offset=
// SUPER_ADMIN sees all logs.
// DOCTOR sees logs for themselves + their compounders.
// COMPOUNDER sees logs for themselves + their delegated doctor (read-only).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 200)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0
  const action = url.searchParams.get('action') || undefined
  const adminUserId = url.searchParams.get('adminUserId') || undefined

  // Build the user-scope filter
  let scopeFilter: Record<string, unknown> = {}

  if (user.role === 'SUPER_ADMIN') {
    // See all
  } else if (user.role === 'DOCTOR') {
    // See own logs + compounders' logs for the same doctor
    // We need to find all admin users that belong to this doctor (the owner + their compounders)
    const ownedDoctorId = user.ownedDoctor?.id
    if (ownedDoctorId) {
      const relatedUsers = await db.adminUser.findMany({
        where: {
          OR: [
            { id: user.id },
            { delegatedDoctorId: ownedDoctorId },
          ],
        },
        select: { id: true },
      })
      const userIds = relatedUsers.map((u) => u.id)
      scopeFilter = { adminUserId: { in: userIds } }
    } else {
      // Doctor with no profile yet — only see own logs
      scopeFilter = { adminUserId: user.id }
    }
  } else if (user.role === 'COMPOUNDER') {
    // See own logs + the delegated doctor's logs
    const delegatedDoctorId = user.delegatedDoctorId
    if (delegatedDoctorId) {
      const doctor = await db.doctor.findUnique({
        where: { id: delegatedDoctorId },
        select: { ownerAdminId: true },
      })
      const userIds = [user.id]
      if (doctor?.ownerAdminId) userIds.push(doctor.ownerAdminId)
      scopeFilter = { adminUserId: { in: userIds } }
    } else {
      scopeFilter = { adminUserId: user.id }
    }
  }

  const where = {
    ...scopeFilter,
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
          select: { name: true, email: true, role: true },
        },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return Response.json({ logs, total, limit, offset })
}
