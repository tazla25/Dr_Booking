// /home/z/my-project/src/app/api/schedules/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, getDoctorScope, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { scheduleSchema } from '@/lib/validators'

// GET /api/schedules?doctorId=...
// Returns schedules scoped to the current user:
//   - SUPER_ADMIN: all (or filtered by ?doctorId=)
//   - DOCTOR: own schedules (or 403 if ?doctorId= is not own)
//   - COMPOUNDER: delegated doctor's schedules (or 403 if ?doctorId= is not delegated)
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const doctorId = url.searchParams.get('doctorId') || undefined

  // If a specific doctorId is requested, verify access
  if (doctorId && !(await canAccessDoctor(user, doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  // Otherwise use the user's scope filter
  const { filter } = await getDoctorScope(user)
  const where = doctorId ? { doctorId } : filter

  const schedules = await db.schedule.findMany({
    where,
    include: { doctor: true, _count: { select: { appointments: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
  return Response.json({ schedules })
}

// POST /api/schedules — create a schedule.
// Allowed for: DOCTOR (for own profile) or COMPOUNDER (for delegated doctor) or SUPER_ADMIN.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = scheduleSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  // Verify the user has access to the target doctorId
  if (!(await canAccessDoctor(user, parsed.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
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
