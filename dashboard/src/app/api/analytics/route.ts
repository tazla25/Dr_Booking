import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') || '30', 10)

  let tz = 'Asia/Dhaka'
  if (user.doctorId) {
    const d = await db.doctor.findUnique({ where: { id: user.doctorId } })
    // if (d?.timezone) tz = d.timezone
  }
  
  const now = new Date()
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const sinceStr = formatInTimeZone(sinceDate, tz, 'yyyy-MM-dd')

  // Scope for compounder
  const scope = user.role === 'compounder' && user.doctorId ? { doctorId: user.doctorId } : {}

  // 1. Daily appointments (last N days)
  const dailyGroups = await db.appointment.groupBy({
    by: ['appointmentDate', 'status'],
    where: { ...scope, appointmentDate: { gte: sinceStr } },
    _count: { _all: true },
  })

  const dailyMap = new Map<string, { total: number; completed: number; cancelled: number; noShow: number }>()
  let totalAppts = 0, completed = 0, noShow = 0, cancelled = 0, confirmed = 0

  for (const g of dailyGroups) {
    const date = g.appointmentDate
    const entry = dailyMap.get(date) || { total: 0, completed: 0, cancelled: 0, noShow: 0 }
    
    const count = g._count._all
    entry.total += count
    totalAppts += count

    if (g.status === 'Completed') {
      entry.completed += count
      completed += count
    } else if (g.status === 'Cancelled') {
      entry.cancelled += count
      cancelled += count
    } else if (g.status === 'NoShow') {
      entry.noShow += count
      noShow += count
    } else if (g.status === 'Confirmed') {
      confirmed += count
    }

    dailyMap.set(date, entry)
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 2. Status breakdown
  const statusCounts = await db.appointment.groupBy({
    by: ['status'],
    where: { ...scope, appointmentDate: { gte: sinceStr } },
    _count: { _all: true },
  })

  // 3. By doctor
  const byDoctor = await db.appointment.groupBy({
    by: ['doctorId'],
    where: { ...scope, appointmentDate: { gte: sinceStr } },
    _count: { _all: true },
  })
  const doctors = await db.doctor.findMany()
  const doctorMap = new Map(doctors.map((d) => [d.id, d]))
  const byDoctorNamed = byDoctor.map((b) => ({
    doctorId: b.doctorId,
    fullName: doctorMap.get(b.doctorId)?.fullName || 'Unknown',
    specialization: doctorMap.get(b.doctorId)?.specialization || '',
    count: b._count._all,
  }))

  // 4. By day of week (SQL groupBy)
  let rawDow: { dow: number; count: bigint | number }[] = []
  if (user.role === 'compounder' && user.doctorId) {
    rawDow = await db.$queryRaw`
      SELECT EXTRACT(DOW FROM CAST("appointmentDate" AS DATE)) as dow, COUNT(*) as count
      FROM "appointments"
      WHERE "appointmentDate" >= ${sinceStr} AND "doctorId" = ${user.doctorId}
      GROUP BY EXTRACT(DOW FROM CAST("appointmentDate" AS DATE))
    `
  } else {
    rawDow = await db.$queryRaw`
      SELECT EXTRACT(DOW FROM CAST("appointmentDate" AS DATE)) as dow, COUNT(*) as count
      FROM "appointments"
      WHERE "appointmentDate" >= ${sinceStr}
      GROUP BY EXTRACT(DOW FROM CAST("appointmentDate" AS DATE))
    `
  }

  const byDow = DAYS.map((day) => ({ day, count: 0 }))
  for (const r of rawDow) {
    const idx = Number(r.dow)
    byDow[idx].count = Number(r.count)
  }

  // 5. KPIs
  const noShowRate = totalAppts > 0 ? (noShow / totalAppts) * 100 : 0
  const completionRate = totalAppts > 0 ? (completed / totalAppts) * 100 : 0

  return Response.json({
    kpis: {
      total: totalAppts,
      completed,
      noShow,
      cancelled,
      confirmed,
      noShowRate: Number(noShowRate.toFixed(1)),
      completionRate: Number(completionRate.toFixed(1)),
    },
    daily,
    statusBreakdown: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    byDoctor: byDoctorNamed,
    byDayOfWeek: byDow,
  })
}
