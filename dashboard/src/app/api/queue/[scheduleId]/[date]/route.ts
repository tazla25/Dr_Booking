// /home/z/my-project/src/app/api/queue/[scheduleId]/[date]/route.ts
// Public endpoint — does NOT require auth so the tracker page can call it.
import { db } from '@/lib/db'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ scheduleId: string; date: string }> }
) {
  const { scheduleId, date } = await ctx.params

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { doctor: true },
  })
  if (!schedule) return Response.json({ error: 'not_found' }, { status: 404 })

  const rows = await db.appointment.findMany({
    where: { scheduleId, appointmentDate: date },
    orderBy: { queueNumber: 'asc' },
  })

  const completed = rows.filter((r) => r.status === 'Completed')
  const pending = rows.filter(
    (r) => r.status !== 'Completed' && r.status !== 'Cancelled' && r.status !== 'NoShow'
  )
  const cancelled = rows.filter((r) => r.status === 'Cancelled' || r.status === 'NoShow')
  const currentToken = completed.length > 0 ? Math.max(...completed.map((r) => r.queueNumber)) : 0

  // Estimated wait = pending count * avg minutes per patient
  const estimatedWaitMinutes = pending.length * schedule.avgMinutesPerPatient

  return Response.json({
    schedule: {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      clinicName: schedule.clinicName,
      clinicAddress: schedule.clinicAddress,
      avgMinutesPerPatient: schedule.avgMinutesPerPatient,
      doctor: schedule.doctor
        ? {
            fullName: schedule.doctor.fullName,
            specialization: schedule.doctor.specialization,
          }
        : null,
    },
    currentToken,
    estimatedWaitMinutes,
    pendingCount: pending.length,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    totalCount: rows.length,
    pending: pending.map((r) => {
      const maskName = (name: string) => {
        if (!name) return name
        const parts = name.split(' ')
        return parts.map((p) => (p.length > 1 ? p[0] + '*'.repeat(p.length - 1) : p)).join(' ')
      }
      return {
        queueNumber: r.queueNumber,
        patientName: maskName(r.patientName),
        status: r.status,
      }
    }),
  })
}
