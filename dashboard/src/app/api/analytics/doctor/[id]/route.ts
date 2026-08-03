// /home/z/my-project/src/app/api/analytics/doctor/[id]/route.ts (Task 4.2)
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!(await canAccessDoctor(user, id))) return Response.json({ error: 'forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const fromStr = url.searchParams.get('from') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const toStr = url.searchParams.get('to') || new Date().toISOString().split('T')[0]
  const doctor = await db.doctor.findUnique({ where: { id }, select: { id: true, fullName: true, specialization: true, fee: true, timezone: true } })
  if (!doctor) return Response.json({ error: 'not_found' }, { status: 404 })
  const where = { doctorId: id, appointmentDate: { gte: fromStr, lte: toStr } }
  const [appts, statusGroups, byDayRaw, feedbackAgg, uniquePatients] = await Promise.all([
    db.appointment.findMany({ where, select: { id: true, patientName: true, patientPhone: true, appointmentDate: true, queueNumber: true, status: true, createdAt: true }, orderBy: { appointmentDate: 'desc' } }),
    db.appointment.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.appointment.groupBy({ by: ['appointmentDate'], where, _count: { _all: true } }),
    db.feedback.aggregate({ _avg: { rating: true }, _count: { _all: true }, where: { appointment: { doctorId: id, appointmentDate: { gte: fromStr, lte: toStr } } } }),
    db.appointment.groupBy({ by: ['patientPhone'], where: { ...where, patientPhone: { not: '+0000000000' } }, _count: { _all: true } }),
  ])
  const totalAppts = appts.length
  const statusMap: Record<string, number> = {}
  for (const g of statusGroups) statusMap[g.status] = g._count._all
  const completed = statusMap['Completed'] || 0, noShow = statusMap['NoShow'] || 0, cancelled = statusMap['Cancelled'] || 0, confirmed = statusMap['Confirmed'] || 0
  const daily = byDayRaw.map(g => ({ date: g.appointmentDate, count: g._count._all })).sort((a, b) => a.date.localeCompare(b.date))
  const byDow = DAYS.map(d => ({ day: d, count: 0 }))
  for (const a of appts) { const dayName = DAYS[new Date(a.appointmentDate + 'T00:00:00').getDay()]; const entry = byDow.find(d => d.day === dayName); if (entry) entry.count++ }
  const totalUniquePatients = uniquePatients.length
  const returningPatients = uniquePatients.filter(g => g._count._all > 1).length
  const returningRate = totalUniquePatients > 0 ? (returningPatients / totalUniquePatients) * 100 : 0
  const revenue = completed * (doctor.fee || 0)
  const recentFeedback = await db.feedback.findMany({ where: { appointment: { doctorId: id, appointmentDate: { gte: fromStr, lte: toStr } }, comment: { not: null } }, orderBy: { createdAt: 'desc' }, take: 10, include: { appointment: { select: { patientName: true, appointmentDate: true } } } })
  return Response.json({ doctor, range: { from: fromStr, to: toStr }, summary: { total: totalAppts, completed, noShow, cancelled, confirmed, noShowRate: totalAppts > 0 ? Number(((noShow / totalAppts) * 100).toFixed(1)) : 0, completionRate: totalAppts > 0 ? Number(((completed / totalAppts) * 100).toFixed(1)) : 0, uniquePatients: totalUniquePatients, returningPatients, returningRate: Number(returningRate.toFixed(1)), revenue, averageRating: feedbackAgg._avg.rating ? Number(feedbackAgg._avg.rating.toFixed(2)) : 0, feedbackCount: feedbackAgg._count._all }, daily, byDayOfWeek: byDow, recentFeedback: recentFeedback.map(f => ({ id: f.id, rating: f.rating, comment: f.comment, createdAt: f.createdAt, patientName: f.appointment.patientName, appointmentDate: f.appointment.appointmentDate })) })
}
