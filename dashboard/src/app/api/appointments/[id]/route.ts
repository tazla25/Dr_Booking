// /home/z/my-project/src/app/api/appointments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.appointment.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })
  if (user.role === 'compounder' && user.doctorId && existing.doctorId !== user.doctorId) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.appointment.delete({ where: { id } })
  await audit(user, 'appointment.delete', id, `Deleted appointment for ${existing.patientName}`)
  return NextResponse.json({ ok: true })
}
