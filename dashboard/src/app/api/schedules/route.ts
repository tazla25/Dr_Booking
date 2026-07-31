// /home/z/my-project/src/app/api/schedules/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { scheduleSchema } from '@/lib/validators'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const doctorId = url.searchParams.get('doctorId')

  const schedules = await db.schedule.findMany({
    where: doctorId ? { doctorId } : undefined,
    include: { doctor: true, _count: { select: { appointments: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
  return Response.json({ schedules })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 })

  let parsed
  try {
    parsed = scheduleSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const created = await db.schedule.create({
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
  await audit(user, 'schedule.create', created.id, `Created schedule for ${created.doctor?.fullName}`)
  return Response.json({ schedule: created }, { status: 201 })
}
