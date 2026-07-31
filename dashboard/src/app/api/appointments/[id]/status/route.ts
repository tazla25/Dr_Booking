// /home/z/my-project/src/app/api/appointments/[id]/status/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { appointmentStatusSchema } from '@/lib/validators'
import { z } from 'zod'

const bodySchema = z.object({ status: appointmentStatusSchema })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const existing = await db.appointment.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  // Compounders can only update their own doctor's appointments
  if (user.role === 'compounder' && user.doctorId && existing.doctorId !== user.doctorId) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: parsed.status },
  })
  await audit(user, 'appointment.status', id, `Marked as ${parsed.status}`)
  return Response.json({ appointment: updated })
}
