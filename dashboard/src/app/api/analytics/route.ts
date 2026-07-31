// /home/z/my-project/src/app/api/analytics/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') || '30', 10)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  // Scope for compounder
  const scope = user.role === 'compounder' && user.doctorId ? { doctorId: user.doctorId } : {}

  // 1. Daily appointments (last N days)
  const dailyRows = await db.appointment.findMany({
    where: { ...scope, appointmentDate: { gte: sinceStr } },
    select: { appointmentDate: true, status: true },
  })
  const dailyMap = new Map<string, { total: number; completed: number; cancelled: number; noShow: number }>()
  for (const r of dailyRows) {
    const entry = dailyMap.get(r.appointmentDate) || { total: 0, completed: 0, cancelled: 0, noShow: 0 }
    entry.total++
    if (r.status === 'Completed') entry.completed++
    if (r.status === 'Cancelled') entry.cancelled++
    if (r.status === 'NoShow') entry.noShow++
    dailyMap.set(r.appointmentDate, entry)
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

  // 4. By day of week
  const byDowRows = await db.appointment.findMany({
    where: { ...scope, appointmentDate: { gte: sinceStr } },
    select: { appointmentDate: true },
  })
  const dowCounts: Record<string, number> = {}
  for (const d of DAYS) dowCounts[d] = 0
  for (const r of byDowRows) {
    const dow = DAYS[new Date(r.appointmentDate).getDay()]
    dowCounts[dow]++
  }
  const byDow = DAYS.map((day) => ({ day, count: dowCounts[day] }))

  // 5. KPIs
  const totalAppts = dailyRows.length
  const completed = dailyRows.filter((r) => r.status === 'Completed').length
  const noShow = dailyRows.filter((r) => r.status === 'NoShow').length
  const cancelled = dailyRows.filter((r) => r.status === 'Cancelled').length
  const confirmed = dailyRows.filter((r) => r.status === 'Confirmed').length
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
