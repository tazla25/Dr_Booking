// /home/z/my-project/src/app/api/admin/compounders/[id]/route.ts (V8-15)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'DOCTOR') return Response.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params

  const ownedDoctor = await db.doctor.findUnique({ where: { ownerAdminId: user.id } })
  if (!ownedDoctor) return Response.json({ error: 'no_doctor_profile' }, { status: 403 })

  const compounder = await db.adminUser.findUnique({ where: { id } })
  if (!compounder || compounder.role !== 'COMPOUNDER' || compounder.delegatedDoctorId !== ownedDoctor.id) {
    return Response.json({ error: 'not_found', message: 'Compounder not found or not delegated to you' }, { status: 404 })
  }

  // Deactivate (don't delete — keep audit trail)
  await db.adminUser.update({
    where: { id },
    data: { isActive: false, delegatedDoctorId: null, whatsappNumber: null },
  })

  await audit(user, 'compounder.remove', id, `Removed compounder ${compounder.name}`)
  return NextResponse.json({ ok: true })
}
