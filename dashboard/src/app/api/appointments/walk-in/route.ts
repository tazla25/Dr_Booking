// /home/z/my-project/src/app/api/appointments/walk-in/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor, applyRateLimit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'

const bodySchema = z.object({
  scheduleId: z.string().min(1),
  patientName: z.string().trim().min(2).max(100),
  patientPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10-15 digits'),
  appointmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  notes: z.string().max(500).optional(),
})

// Race-condition safe queue-number assignment with retry (analysis Phase 0 fix)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  // IMP-005 fix: throttle walk-in creation per user (30/min by default — see
  // RATE_LIMITS.appointmentWalkIn). Walk-ins are the most write-heavy action
  // a compounder takes, so this is the highest-value place to enforce a cap.
  const limited = await applyRateLimit(req, 'appointmentWalkIn', user.id)
  if (limited) return limited

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const schedule = await db.schedule.findUnique({
    where: { id: parsed.scheduleId },
    include: { doctor: true },
  })
  if (!schedule) return Response.json({ error: 'schedule_not_found' }, { status: 404 })

  // Verify ownership: compounder must have this doctor delegated; doctor must own this schedule
  if (!(await canAccessDoctor(user, schedule.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  let attempts = 0
  let created
  while (attempts < 3) {
    try {
      const maxRow = await db.appointment.aggregate({
        _max: { queueNumber: true },
        where: { scheduleId: parsed.scheduleId, appointmentDate: parsed.appointmentDate },
      })
      const nextQueue = (maxRow._max.queueNumber ?? 0) + 1
      created = await db.appointment.create({
        data: {
          scheduleId: parsed.scheduleId,
          doctorId: schedule.doctorId,
          patientName: parsed.patientName,
          patientPhone: parsed.patientPhone,
          appointmentDate: parsed.appointmentDate,
          queueNumber: nextQueue,
          status: 'Confirmed',
          // BUG-011 fix: explicit source so the dashboard doesn't have to
          // sniff the sentinel phone number ('+0000000000') to detect walk-ins.
          source: 'WALK_IN',
          notes: parsed.notes || null,
        },
        include: { doctor: true, schedule: true },
      })
      break
    } catch (e) {
      attempts++
      if (attempts >= 3) {
        return Response.json(
          { error: 'race_condition', message: 'Could not assign queue number after retries' },
          { status: 409 }
        )
      }
    }
  }

  await audit(user, 'appointment.walkin', created!.id, `Walk-in: ${created!.patientName}`)
  return Response.json({ appointment: created }, { status: 201 })
}
