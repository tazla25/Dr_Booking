// /home/z/my-project/src/app/api/appointments/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/appointments?doctorId=&status=&date=&from=&to=&q=&limit=&offset=
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const doctorId = url.searchParams.get('doctorId') || undefined
  const status = url.searchParams.get('status') || undefined
  const date = url.searchParams.get('date') || undefined
  const from = url.searchParams.get('from') || undefined
  const to = url.searchParams.get('to') || undefined
  const q = url.searchParams.get('q')?.trim() || undefined
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0

  // Compounders only see their own doctor's appointments
  const scope = user.role === 'compounder' && user.doctorId ? { doctorId: user.doctorId } : {}

  const where = {
    ...scope,
    ...(doctorId ? { doctorId } : {}),
    ...(status ? { status } : {}),
    ...(date ? { appointmentDate: date } : {}),
    ...(from && to ? { appointmentDate: { gte: from, lte: to } } : {}),
    ...(q
      ? {
          OR: [
            { patientName: { contains: q } },
            { patientPhone: { contains: q } },
          ],
        }
      : {}),
  }

  const [appointments, total] = await Promise.all([
    db.appointment.findMany({
      where,
      include: {
        doctor: { select: { id: true, fullName: true, specialization: true } },
        schedule: { select: { id: true, clinicName: true, startTime: true, endTime: true } },
      },
      orderBy: [{ appointmentDate: 'desc' }, { queueNumber: 'asc' }],
      take: limit,
      skip: offset,
    }),
    db.appointment.count({ where }),
  ])

  return Response.json({ appointments, total, limit, offset })
}
