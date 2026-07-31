// /home/z/my-project/src/app/api/schedules/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { scheduleSchema } from '@/lib/validators'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const schedule = await db.schedule.findUnique({
    where: { id },
    include: { doctor: true },
  })
  if (!schedule) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json({ schedule })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params

  let parsed
  try {
    parsed = scheduleSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const updated = await db.schedule.update({
    where: { id },
    data: {
      doctorId: parsed.doctorId,
      pinCode: parsed.pinCode,
      dayOfWeek: parsed.dayOfWeek,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      clinicName: parsed.clinicName || null,
      clinicAddress: parsed.clinicAddress || null,
      avgMinutesPerPatient: parsed.avgMinutesPerPatient,
    },
    include: { doctor: true },
  })
  await audit(user, 'schedule.update', id, `Updated schedule ${id}`)
  return Response.json({ schedule: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params

  await db.schedule.delete({ where: { id } })
  await audit(user, 'schedule.delete', id, `Deleted schedule ${id}`)
  return NextResponse.json({ ok: true })
}
