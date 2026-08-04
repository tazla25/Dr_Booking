// /home/z/my-project/src/app/api/appointments/calendar/route.ts
// Calendar API — returns appointments grouped by date for a given month.
// GET /api/appointments/calendar?year=2026&month=8&doctorId=xxx
//
// Returns: { days: [{ date, count, completed, confirmed, cancelled, noShow, pending }] }

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDoctorScope } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10)
  const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1), 10)
  const doctorIdFilter = url.searchParams.get('doctorId') || undefined

  // Build scope filter for appointments
  const { filter: scope } = await getDoctorScope(user)
  const doctorFilter = doctorIdFilter ? { doctorId: doctorIdFilter } : {}

  // Calculate date range for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Group appointments by date and status
  const groups = await db.appointment.groupBy({
    by: ['appointmentDate', 'status'],
    where: {
      ...scope,
      ...doctorFilter,
      appointmentDate: { gte: startDate, lte: endDate },
    },
    _count: { _all: true },
    orderBy: { appointmentDate: 'asc' },
  })

  // Build a map of date -> status counts
  const dayMap = new Map<string, { date: string; count: number; completed: number; confirmed: number; cancelled: number; noShow: number; pending: number }>()

  for (const g of groups) {
    const date = g.appointmentDate
    if (!dayMap.has(date)) {
      dayMap.set(date, { date, count: 0, completed: 0, confirmed: 0, cancelled: 0, noShow: 0, pending: 0 })
    }
    const entry = dayMap.get(date)!
    const count = g._count._all
    entry.count += count
    if (g.status === 'Completed') entry.completed += count
    else if (g.status === 'Confirmed') entry.confirmed += count
    else if (g.status === 'Cancelled') entry.cancelled += count
    else if (g.status === 'NoShow') entry.noShow += count
    else if (g.status === 'Pending') entry.pending += count
  }

  // Build full month array (including empty days)
  const days: Array<{ date: string; count: number; completed: number; confirmed: number; cancelled: number; noShow: number; pending: number }> = []
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entry = dayMap.get(dateStr)
    days.push(entry || { date: dateStr, count: 0, completed: 0, confirmed: 0, cancelled: 0, noShow: 0, pending: 0 })
  }

  // Get unique doctors for the filter dropdown (Super Admin only)
  let doctors: Array<{ id: string; fullName: string; specialization: string }> = []
  if (user.role === 'SUPER_ADMIN') {
    doctors = await db.doctor.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, specialization: true },
      orderBy: { fullName: 'asc' },
    })
  }

  return Response.json({
    year,
    month,
    days,
    doctors,
    summary: {
      totalAppointments: days.reduce((s, d) => s + d.count, 0),
      totalCompleted: days.reduce((s, d) => s + d.completed, 0),
      totalConfirmed: days.reduce((s, d) => s + d.confirmed, 0),
      totalCancelled: days.reduce((s, d) => s + d.cancelled, 0),
      totalNoShow: days.reduce((s, d) => s + d.noShow, 0),
      busyDays: days.filter((d) => d.count > 0).length,
    },
  })
}
