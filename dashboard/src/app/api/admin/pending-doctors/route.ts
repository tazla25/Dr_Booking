// /home/z/my-project/src/app/api/admin/pending-doctors/route.ts
//
// Phase 1 reform: Super-admin-only endpoint to list doctors awaiting verification.
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'forbidden', message: 'Super admin only' }, { status: 403 })
  }

  const pending = await db.adminUser.findMany({
    where: {
      role: 'DOCTOR',
      verificationStatus: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      medicalRegNumber: true,
      specialization: true,
      verificationDocs: true,
      telegramChatId: true,
      createdAt: true,
    },
  })

  return Response.json({ pendingDoctors: pending })
}
