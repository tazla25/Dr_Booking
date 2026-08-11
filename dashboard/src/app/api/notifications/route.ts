// /home/z/my-project/src/app/api/notifications/route.ts
// Notifications API — aggregates recent activity for the current user.
// GET /api/notifications — returns recent notifications (new bookings, completed, feedback, pending verifications).
//
// Notification types:
//   - new_booking: A new appointment was created
//   - appointment_completed: An appointment was marked completed
//   - feedback_received: New patient feedback was submitted
//   - pending_verification: (Super Admin only) A doctor is pending verification
//   - compounder_invited: A compounder was invited
//   - high_no_show: Alert when no-show rate exceeds 30%

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDoctorScope } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'

const IST = 'Asia/Kolkata'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { filter: scope } = await getDoctorScope(user)
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const todayStr = formatInTimeZone(now, IST, 'yyyy-MM-dd')

  interface Notification {
    id: string
    type: string
    title: string
    message: string
    timestamp: string
    severity: 'info' | 'success' | 'warning' | 'error'
    actionUrl?: string
    read: boolean
  }

  const notifications: Notification[] = []

  // 1. New bookings today (confirmed/pending)
  const todayBookings = await db.appointment.count({
    where: {
      ...scope,
      appointmentDate: todayStr,
      status: { in: ['Confirmed', 'Pending'] },
    },
  })

  if (todayBookings > 0) {
    notifications.push({
      id: 'today-bookings',
      type: 'new_booking',
      title: 'Today\'s Appointments',
      message: `${todayBookings} ${todayBookings === 1 ? 'patient is' : 'patients are'} scheduled for today`,
      timestamp: now.toISOString(),
      severity: 'info',
      actionUrl: '/?view=appointments&date=' + todayStr,
      read: false,
    })
  }

  // 2. Completed today
  const completedToday = await db.appointment.count({
    where: {
      ...scope,
      appointmentDate: todayStr,
      status: 'Completed',
    },
  })

  if (completedToday > 0) {
    notifications.push({
      id: 'completed-today',
      type: 'appointment_completed',
      title: 'Appointments Completed',
      message: `${completedToday} ${completedToday === 1 ? 'appointment has' : 'appointments have'} been completed today`,
      timestamp: now.toISOString(),
      severity: 'success',
      actionUrl: '/?view=appointments',
      read: false,
    })
  }

  // 3. Recent feedback (last 7 days)
  const recentFeedback = await db.feedback.count({
    where: {
      createdAt: { gte: weekAgo },
      appointment: { ...scope },
    },
  })

  if (recentFeedback > 0) {
    // Get the average rating of recent feedback
    const feedbackAgg = await db.feedback.aggregate({
      _avg: { rating: true },
      where: {
        createdAt: { gte: weekAgo },
        appointment: { ...scope },
      },
    })
    const avgRating = feedbackAgg._avg.rating ? Number(feedbackAgg._avg.rating.toFixed(1)) : 0

    notifications.push({
      id: 'recent-feedback',
      type: 'feedback_received',
      title: 'New Patient Feedback',
      message: `${recentFeedback} new ${recentFeedback === 1 ? 'review' : 'reviews'} in the last 7 days · Avg: ${avgRating}★`,
      timestamp: now.toISOString(),
      severity: avgRating >= 4 ? 'success' : avgRating >= 3 ? 'info' : 'warning',
      actionUrl: '/?view=analytics',
      read: false,
    })
  }

  // 4. Pending doctor verification (Super Admin only)
  if (user.role === 'SUPER_ADMIN') {
    const pendingDoctors = await db.adminUser.count({
      where: { role: 'DOCTOR', verificationStatus: 'PENDING' },
    })

    if (pendingDoctors > 0) {
      notifications.push({
        id: 'pending-verification',
        type: 'pending_verification',
        title: 'Doctor Verification Pending',
        message: `${pendingDoctors} ${pendingDoctors === 1 ? 'doctor is' : 'doctors are'} waiting for verification`,
        timestamp: now.toISOString(),
        severity: 'warning',
        actionUrl: '/?view=admin-verification',
        read: false,
      })
    }
  }

  // 5. No-show rate alert (if > 30% in last 7 days)
  const last7DaysAppointments = await db.appointment.findMany({
    where: {
      ...scope,
      appointmentDate: { gte: formatInTimeZone(weekAgo, IST, 'yyyy-MM-dd') },
    },
    select: { status: true },
  })

  if (last7DaysAppointments.length >= 5) {
    const noShowCount = last7DaysAppointments.filter((a) => a.status === 'NoShow').length
    const noShowRate = (noShowCount / last7DaysAppointments.length) * 100

    if (noShowRate > 30) {
      notifications.push({
        id: 'high-no-show',
        type: 'high_no_show',
        title: 'High No-show Rate Alert',
        message: `No-show rate is ${noShowRate.toFixed(0)}% in the last 7 days (${noShowCount}/${last7DaysAppointments.length})`,
        timestamp: now.toISOString(),
        severity: 'error',
        actionUrl: '/?view=analytics',
        read: false,
      })
    }
  }

  // 6. Walk-in patients today
  const walkInsToday = await db.appointment.count({
    where: {
      ...scope,
      appointmentDate: todayStr,
      source: 'WALK_IN',
    },
  })

  if (walkInsToday > 0) {
    notifications.push({
      id: 'walkins-today',
      type: 'new_booking',
      title: 'Walk-in Patients',
      message: `${walkInsToday} walk-in ${walkInsToday === 1 ? 'patient' : 'patients'} added today`,
      timestamp: now.toISOString(),
      severity: 'info',
      actionUrl: '/?view=appointments&date=' + todayStr,
      read: false,
    })
  }

  // 7. New patients in last 24 hours
  const newPatients = await db.appointment.findMany({
    where: {
      ...scope,
      createdAt: { gte: yesterday },
      source: { not: 'WALK_IN' },
    },
    select: { patientName: true, patientPhone: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
    distinct: ['patientPhone'],
  })

  if (newPatients.length > 0) {
    notifications.push({
      id: 'new-patients',
      type: 'new_booking',
      title: 'New Patient Registrations',
      message: `${newPatients.length} new ${newPatients.length === 1 ? 'patient' : 'patients'} booked in the last 24 hours`,
      timestamp: newPatients[0].createdAt.toISOString(),
      severity: 'success',
      actionUrl: '/?view=patients',
      read: false,
    })
  }

  // Sort by severity (error > warning > info > success), then by timestamp
  const severityOrder = { error: 0, warning: 1, info: 2, success: 3 }
  notifications.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (sevDiff !== 0) return sevDiff
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  const unreadCount = notifications.length

  return Response.json({
    notifications,
    unreadCount,
    total: notifications.length,
  })
}
