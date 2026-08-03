// /home/z/my-project/src/app/api/admin/compounders/route.ts (V8-15)
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'DOCTOR') return Response.json({ error: 'forbidden' }, { status: 403 })

  const ownedDoctor = await db.doctor.findUnique({ where: { ownerAdminId: user.id } })
  if (!ownedDoctor) return Response.json({ compounders: [] })

  const compounders = await db.adminUser.findMany({
    where: { delegatedDoctorId: ownedDoctor.id, role: 'COMPOUNDER' },
    select: { id: true, name: true, phone: true, telegramChatId: true, isActive: true, invitedAt: true, lastLoginAt: true },
    orderBy: { invitedAt: 'desc' },
  })

  return Response.json({ compounders })
}
