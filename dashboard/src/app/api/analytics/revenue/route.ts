// /home/z/my-project/src/app/api/analytics/revenue/route.ts
// Revenue Analytics API — calculates actual revenue from completed appointments.
// GET /api/analytics/revenue?days=30 — returns revenue stats for the given period.
//
// Revenue is calculated by joining completed appointments with doctor fees.

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDoctorScope } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'

const IST = 'Asia/Kolkata'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 365)

  const { filter: scope } = await getDoctorScope(user)
  const now = new Date()
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const sinceStr = formatInTimeZone(sinceDate, IST, 'yyyy-MM-dd')
  const todayStr = formatInTimeZone(now, IST, 'yyyy-MM-dd')

  // Fetch completed appointments with doctor fee in the date range
  const completed = await db.appointment.findMany({
    where: {
      ...scope,
      status: 'Completed',
      appointmentDate: { gte: sinceStr },
    },
    select: {
      id: true,
      appointmentDate: true,
      doctorId: true,
      patientPhone: true,
      doctor: {
        select: {
          id: true,
          fullName: true,
          specialization: true,
          fee: true,
        },
      },
    },
    take: 5000,
  })

  // Calculate totals
  const totalRevenue = completed.reduce((sum, a) => sum + (a.doctor.fee || 0), 0)
  const totalCompleted = completed.length

  // Today's revenue
  const todayCompleted = completed.filter((a) => a.appointmentDate === todayStr)
  const todayRevenue = todayCompleted.reduce((sum, a) => sum + (a.doctor.fee || 0), 0)

  // Revenue by day
  const dailyMap = new Map<string, { date: string; revenue: number; count: number }>()
  for (const a of completed) {
    const date = a.appointmentDate
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, revenue: 0, count: 0 })
    }
    const entry = dailyMap.get(date)!
    entry.revenue += a.doctor.fee || 0
    entry.count += 1
  }

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30) // Last 30 days max for chart

  // Revenue by doctor
  const doctorMap = new Map<string, { doctorId: string; fullName: string; specialization: string; revenue: number; count: number }>()
  for (const a of completed) {
    if (!doctorMap.has(a.doctorId)) {
      doctorMap.set(a.doctorId, {
        doctorId: a.doctorId,
        fullName: a.doctor.fullName,
        specialization: a.doctor.specialization,
        revenue: 0,
        count: 0,
      })
    }
    const entry = doctorMap.get(a.doctorId)!
    entry.revenue += a.doctor.fee || 0
    entry.count += 1
  }

  const byDoctor = Array.from(doctorMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Unique paying patients
  const uniquePatients = new Set(completed.map((a) => a.patientPhone)).size

  // Average revenue per appointment
  const avgRevenuePerAppt = totalCompleted > 0 ? Math.round(totalRevenue / totalCompleted) : 0

  // Week-over-week growth
  const weekAgo = formatInTimeZone(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), IST, 'yyyy-MM-dd')
  const twoWeeksAgo = formatInTimeZone(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), IST, 'yyyy-MM-dd')

  const thisWeekRevenue = completed
    .filter((a) => a.appointmentDate >= weekAgo)
    .reduce((sum, a) => sum + (a.doctor.fee || 0), 0)
  const lastWeekCompleted = await db.appointment.findMany({
    where: {
      ...scope,
      status: 'Completed',
      appointmentDate: { gte: twoWeeksAgo, lt: weekAgo },
    },
    select: { doctor: { select: { fee: true } } },
  })
  const lastWeekRevenue = lastWeekCompleted.reduce((sum, a) => sum + (a.doctor.fee || 0), 0)

  const growthRate = lastWeekRevenue > 0
    ? Number((((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100).toFixed(1))
    : thisWeekRevenue > 0 ? 100 : 0

  return Response.json({
    summary: {
      totalRevenue,
      todayRevenue,
      totalCompleted,
      todayCompleted: todayCompleted.length,
      uniquePatients,
      avgRevenuePerAppt,
      growthRate,
      thisWeekRevenue,
      lastWeekRevenue,
    },
    daily,
    byDoctor,
  })
}
