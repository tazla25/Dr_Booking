// /home/z/my-project/src/app/api/appointments/[id]/reschedule/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { rescheduleSchema } from '@/lib/validators'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  let parsed
  try {
    parsed = rescheduleSchema.parse({ ...(await req.json()), appointmentId: id })
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const existing = await db.appointment.findUnique({ where: { id }, include: { schedule: true } })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })
  if (user.role === 'compounder' && user.doctorId && existing.doctorId !== user.doctorId) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const newDateDay = days[new Date(parsed.newDate).getUTCDay()]
  if (existing.schedule.dayOfWeek !== newDateDay) {
    return Response.json(
      {
        error: 'invalid_day',
        message: `Cannot reschedule. ${parsed.newDate} is a ${newDateDay}, but this schedule runs on ${existing.schedule.dayOfWeek}`,
      },
      { status: 400 }
    )
  }

  // Recompute queue number for new date — race-condition safe with retry
  let attempts = 0
  let updated
  while (attempts < 3) {
    try {
      const maxRow = await db.appointment.aggregate({
        _max: { queueNumber: true },
        where: { scheduleId: existing.scheduleId, appointmentDate: parsed.newDate },
      })
      const nextQueue = (maxRow._max.queueNumber ?? 0) + 1
      updated = await db.appointment.update({
        where: { id },
        data: { appointmentDate: parsed.newDate, queueNumber: nextQueue, status: 'Confirmed' },
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

  await audit(user, 'appointment.reschedule', id, `Rescheduled to ${parsed.newDate}`)
  return Response.json({ appointment: updated })
}
