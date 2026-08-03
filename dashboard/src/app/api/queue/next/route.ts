// /home/z/my-project/src/app/api/queue/next/route.ts
// Calls the next patient: marks the next "Confirmed" appointment as "Completed".
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'

const bodySchema = z.object({
  scheduleId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  // Verify the user has access to the schedule's doctor before proceeding
  const schedule = await db.schedule.findUnique({
    where: { id: parsed.scheduleId },
    select: { doctorId: true },
  })
  if (!schedule) return Response.json({ error: 'schedule_not_found' }, { status: 404 })
  if (!(await canAccessDoctor(user, schedule.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const next = await db.appointment.findFirst({
    where: {
      scheduleId: parsed.scheduleId,
      appointmentDate: parsed.date,
      status: 'Confirmed',
    },
    orderBy: { queueNumber: 'asc' },
  })

  if (!next) {
    return Response.json({ ok: false, message: 'no_next' })
  }

  const updated = await db.appointment.update({
    where: { id: next.id },
    data: { status: 'Completed' },
  })
  await audit(user, 'queue.next', next.id, `Called next patient #${next.queueNumber}`)
  return Response.json({ ok: true, appointment: updated })
}
