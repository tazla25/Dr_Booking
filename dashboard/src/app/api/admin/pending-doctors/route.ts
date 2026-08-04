// /home/z/my-project/src/app/api/admin/pending-doctors/route.ts (Task 1.2)
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'SUPER_ADMIN') return Response.json({ error: 'forbidden' }, { status: 403 })
  const pending = await db.adminUser.findMany({
    where: { role: 'DOCTOR', verificationStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, phone: true, medicalRegNumber: true, specialization: true, verificationDocs: true, whatsappNumber: true, createdAt: true },
  })
  return Response.json({ pendingDoctors: pending })
}
