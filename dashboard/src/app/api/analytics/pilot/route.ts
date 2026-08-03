// /home/z/my-project/src/app/api/analytics/pilot/route.ts (Task 4.1)
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'SUPER_ADMIN') return Response.json({ error: 'forbidden' }, { status: 403 })
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [totalDoctors, activeDoctors, pendingDoctors, newDoctorsThisWeek] = await Promise.all([
    db.doctor.count(), db.doctor.count({ where: { isActive: true } }),
    db.adminUser.count({ where: { role: 'DOCTOR', verificationStatus: 'PENDING' } }),
    db.doctor.count({ where: { createdAt: { gte: weekAgo } } }),
  ])
  const apptStatusGroups = await db.appointment.groupBy({ by: ['status'], _count: { _all: true } })
  const statusMap: Record<string, number> = {}
  for (const g of apptStatusGroups) statusMap[g.status] = g._count._all
  const totalAppts = apptStatusGroups.reduce((s, g) => s + g._count._all, 0)
  const completed = statusMap['Completed'] || 0, noShow = statusMap['NoShow'] || 0, cancelled = statusMap['Cancelled'] || 0, confirmed = statusMap['Confirmed'] || 0
  const walkInBookings = await db.appointment.count({ where: { patientPhone: '+0000000000' } })
  const onlineBookings = totalAppts - walkInBookings
  const patientGroups = await db.appointment.groupBy({ by: ['patientPhone'], where: { patientPhone: { not: '+0000000000' } }, _count: { _all: true } })
  const totalPatients = patientGroups.length
  const returningPatients = patientGroups.filter(g => g._count._all > 1).length
  const returningRate = totalPatients > 0 ? (returningPatients / totalPatients) * 100 : 0
  const totalPatientBookings = patientGroups.reduce((s, g) => s + g._count._all, 0)
  const avgBookingsPerPatient = totalPatients > 0 ? totalPatientBookings / totalPatients : 0
  const feedbackAgg = await db.feedback.aggregate({ _avg: { rating: true }, _count: { _all: true } })
  const feedbackResponseRate = completed > 0 ? (feedbackAgg._count._all / completed) * 100 : 0
  const ESTIMATED_MINUTES_SAVED_PER_PATIENT = 60
  const totalMinutesSaved = completed * ESTIMATED_MINUTES_SAVED_PER_PATIENT
  const fourteenDaysAgoStr = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const dailyGroups = await db.appointment.groupBy({ by: ['appointmentDate'], where: { appointmentDate: { gte: fourteenDaysAgoStr } }, _count: { _all: true } })
  const daily = dailyGroups.map(g => ({ date: g.appointmentDate, count: g._count._all })).sort((a, b) => a.date.localeCompare(b.date))
  const byDoctor = await db.appointment.groupBy({ by: ['doctorId'], _count: { _all: true } })
  const topDoctorIds = byDoctor.sort((a, b) => b._count._all - a._count._all).slice(0, 5).map(g => g.doctorId)
  const topDoctors = await db.doctor.findMany({ where: { id: { in: topDoctorIds } }, select: { id: true, fullName: true, specialization: true } })
  const doctorLeaderboard = byDoctor.filter(g => topDoctorIds.includes(g.doctorId)).map(g => {
    const d = topDoctors.find(d => d.id === g.doctorId)
    return { doctorId: g.doctorId, fullName: d?.fullName || 'Unknown', specialization: d?.specialization || '', count: g._count._all }
  }).sort((a, b) => b.count - a.count)
  return Response.json({
    doctors: { total: totalDoctors, active: activeDoctors, pendingVerification: pendingDoctors, newThisWeek: newDoctorsThisWeek },
    appointments: { total: totalAppts, onlineBookings, walkInBookings, completed, noShow, cancelled, confirmed, completedRate: totalAppts > 0 ? Number(((completed / totalAppts) * 100).toFixed(1)) : 0, noShowRate: totalAppts > 0 ? Number(((noShow / totalAppts) * 100).toFixed(1)) : 0, cancellationRate: totalAppts > 0 ? Number(((cancelled / totalAppts) * 100).toFixed(1)) : 0 },
    patients: { total: totalPatients, returningRate: Number(returningRate.toFixed(1)), averageBookingsPerPatient: Number(avgBookingsPerPatient.toFixed(1)) },
    feedback: { averageRating: feedbackAgg._avg.rating ? Number(feedbackAgg._avg.rating.toFixed(2)) : 0, totalResponses: feedbackAgg._count._all, responseRate: Number(feedbackResponseRate.toFixed(1)) },
    timeSaved: { estimatedMinutesPerPatient: ESTIMATED_MINUTES_SAVED_PER_PATIENT, totalMinutesSaved },
    daily, onlineVsWalkIn: [{ name: 'Online', count: onlineBookings }, { name: 'Walk-in', count: walkInBookings }], doctorLeaderboard,
  })
}
