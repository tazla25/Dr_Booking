// /home/z/my-project/src/app/api/appointments/[id]/reschedule/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { rescheduleSchema } from '@/lib/validators'
import { notifyPatients, getPatientLang, buildRescheduledMessage } from '@/lib/bot-notify'

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

  // Verify ownership using new role-based scoping
  if (!(await canAccessDoctor(user, existing.doctorId))) {
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

  // V3-005 fix: reject reschedules to CLOSED dates. The previous code only
  // checked dayOfWeek — if the doctor marked the target date as CLOSED
  // (holiday, sick leave), the reschedule still went through and the
  // patient showed up to a closed chamber.
  const override = await db.scheduleOverride.findUnique({
    where: { scheduleId_date: { scheduleId: existing.scheduleId, date: parsed.newDate } },
  })
  if (override?.type === 'CLOSED') {
    return Response.json(
      {
        error: 'date_closed',
        message: `Cannot reschedule. ${parsed.newDate} is marked as closed${override.reason ? `: ${override.reason}` : ''}`,
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

  // V3-004 fix: notify the patient of the new date + new token number.
  // The previous code updated the DB and wrote an audit log but never
  // told the patient — they showed up on the old date with the old token.
  // Fire-and-forget: a notification failure must not fail the reschedule.
  // V3-006 fix: pass a pre-approved template so the bot can fall back to
  // it if the free-text send fails outside the 24-hour window.
  // V3-009 fix: use the centralized buildRescheduledMessage() helper.
  if (updated) {
    try {
      const lang = await getPatientLang(existing.patientPhone, db)
      const { text: message, template } = buildRescheduledMessage({
        newDate: parsed.newDate,
        queueNumber: updated.queueNumber,
        scheduleId: existing.scheduleId,
        lang,
      })
      notifyPatients([existing.patientPhone], message, template).catch((err) => {
        console.error(`[reschedule] Failed to notify patient ${existing.patientPhone}:`, err)
      })
    } catch (err) {
      console.error('[reschedule] Failed to build/send patient notification:', err)
    }
  }

  return Response.json({ appointment: updated })
}
