// /home/z/my-project/src/app/api/public/schedules/route.ts
// Public endpoint — used by the tracker view's schedule picker.
// Returns only the minimal info needed (no admin-only fields).

import { db } from '@/lib/db'

export async function GET() {
  const schedules = await db.schedule.findMany({
    where: { doctor: { isActive: true } },
    include: {
      doctor: {
        select: { id: true, fullName: true, specialization: true },
      },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })

  return Response.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      clinicName: s.clinicName,
      doctor: s.doctor
        ? {
            fullName: s.doctor.fullName,
            specialization: s.doctor.specialization,
          }
        : null,
    })),
  })
}
