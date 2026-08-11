import { HttpError } from 'wasp/server'
import { Appointment, Doctor, User, Schedule, ScheduleOverride, PatientNote, AuditLog, FailedLogin, Feedback } from 'wasp/entities'

// Helper function to extract user's doctor scope
function getDoctorScope(user: User) {
  if (user.role === 'SUPER_ADMIN') {
    return {}
  }
  if (user.role === 'DOCTOR') {
    return { doctor: { ownerAdminId: user.id } }
  }
  if (user.role === 'COMPOUNDER') {
    return { doctorId: user.delegatedDoctorId }
  }
  return { doctorId: 'NONE' }
}

function getDoctorIdScope(user: User) {
  if (user.role === 'SUPER_ADMIN') {
    return {}
  }
  if (user.role === 'DOCTOR') {
    return { ownerAdminId: user.id }
  }
  if (user.role === 'COMPOUNDER') {
    return { id: user.delegatedDoctorId }
  }
  return { id: 'NONE' }
}

export const getAppointments = async (args: { scheduleId?: string, date?: string }, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const where: any = getDoctorScope(context.user)
  if (args.scheduleId) {
    where.scheduleId = args.scheduleId
  }
  if (args.date) {
    where.appointmentDate = args.date
  }

  return context.entities.Appointment.findMany({
    where,
    include: {
      schedule: true,
      doctor: true,
      feedback: true
    },
    orderBy: [
      { appointmentDate: 'desc' },
      { queueNumber: 'asc' }
    ],
    take: 100
  })
}

export const getDoctors = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const where = getDoctorIdScope(context.user)
  return context.entities.Doctor.findMany({
    where,
    include: {
      ownerAdmin: true,
      compounders: true,
      schedules: true
    }
  })
}

export const getAnalytics = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }
  if (context.user.role !== 'SUPER_ADMIN') { throw new HttpError(403) }

  const totalDoctors = await context.entities.Doctor.count()
  const totalAppointments = await context.entities.Appointment.count()
  const totalUsers = await context.entities.User.count()

  return {
    totalDoctors,
    totalAppointments,
    totalUsers
  }
}

export const getDoctorAnalytics = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const scope = getDoctorScope(context.user)
  const totalAppointments = await context.entities.Appointment.count({ where: scope })

  const completedAppointments = await context.entities.Appointment.findMany({
    where: { ...scope, status: 'Completed' },
    include: { doctor: true }
  })

  let revenue = 0
  for (const apt of completedAppointments) {
    if (apt.doctor && apt.doctor.fee) {
      revenue += apt.doctor.fee
    }
  }

  return {
    totalAppointments,
    revenue
  }
}

export const getPatient = async (args: { phone: string }, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const appointments = await context.entities.Appointment.findMany({
    where: { patientPhone: args.phone },
    include: { doctor: true, schedule: true, feedback: true },
    orderBy: { appointmentDate: 'desc' },
    take: 100
  })

  const notes = await context.entities.PatientNote.findMany({
    where: { patientPhone: args.phone },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
    take: 100
  })

  if (appointments.length === 0) {
    throw new HttpError(404, 'Patient not found')
  }

  const patientName = appointments[0].patientName

  return {
    phone: args.phone,
    name: patientName,
    appointments,
    notes
  }
}

export const getPatientReceipts = async (args: { phone: string }, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  return context.entities.Appointment.findMany({
    where: { patientPhone: args.phone },
    include: { doctor: true, schedule: true },
    take: 100
  })
}

export const getSchedules = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const scope = getDoctorIdScope(context.user)
  const doctors = await context.entities.Doctor.findMany({
    where: scope,
    select: { id: true }
  })
  const doctorIds = doctors.map((d: any) => d.id)

  return context.entities.Schedule.findMany({
    where: {
      doctorId: { in: doctorIds }
    },
    include: { doctor: true, overrides: true }
  })
}

export const getOverrides = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const scope = getDoctorIdScope(context.user)
  const doctors = await context.entities.Doctor.findMany({
    where: scope,
    select: { id: true }
  })
  const doctorIds = doctors.map((d: any) => d.id)

  const schedules = await context.entities.Schedule.findMany({
    where: { doctorId: { in: doctorIds } },
    select: { id: true }
  })
  const scheduleIds = schedules.map((s: any) => s.id)

  return context.entities.ScheduleOverride.findMany({
    where: { scheduleId: { in: scheduleIds } },
    include: { schedule: true }
  })
}

export const getNotifications = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  const scope = getDoctorScope(context.user)
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const todayStr = new Date().toISOString().split('T')[0] // simplistic timezone, ideally Asia/Kolkata

  const notifications: any[] = []

  const todayBookings = await context.entities.Appointment.count({
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
      read: false,
    })
  }

  const completedToday = await context.entities.Appointment.count({
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
      read: false,
    })
  }

  const recentFeedback = await context.entities.Feedback.count({
    where: {
      createdAt: { gte: weekAgo },
      appointment: { ...scope },
    },
  })
  if (recentFeedback > 0) {
    notifications.push({
      id: 'recent-feedback',
      type: 'feedback_received',
      title: 'New Patient Feedback',
      message: `${recentFeedback} new ${recentFeedback === 1 ? 'review' : 'reviews'} in the last 7 days`,
      timestamp: now.toISOString(),
      severity: 'info',
      read: false,
    })
  }

  if (context.user.role === 'SUPER_ADMIN') {
    const pendingDoctors = await context.entities.User.count({
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
        read: false,
      })
    }
  }

  const walkInsToday = await context.entities.Appointment.count({
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
      read: false,
    })
  }

  const newPatients = await context.entities.Appointment.findMany({
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
      read: false,
    })
  }

  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 }
  notifications.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (sevDiff !== 0) return sevDiff
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  return notifications
}

export const getAuditLog = async (_args: any, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') { throw new HttpError(403) }

  return context.entities.AuditLog.findMany({
    include: { adminUser: true },
    orderBy: { createdAt: 'desc' },
    take: 100
  })
}

export const getCompounders = async (_args: any, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  let where: any = { role: 'COMPOUNDER' }
  if (context.user.role === 'DOCTOR') {
    const doctor = await context.entities.Doctor.findUnique({
      where: { ownerAdminId: context.user.id }
    })
    if (doctor) {
      where.delegatedDoctorId = doctor.id
    }
  }

  return context.entities.User.findMany({
    where,
    include: { delegatedDoctor: true }
  })
}

export const getFailedLogins = async (_args: any, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') { throw new HttpError(403) }

  return context.entities.FailedLogin.findMany({
    orderBy: { attemptedAt: 'desc' },
    take: 100
  })
}

export const getBatchQueue = async (args: { scheduleIds: string[], date: string }, context: any) => {
  if (!context.user) { throw new HttpError(401) }

  return context.entities.Appointment.findMany({
    where: {
      scheduleId: { in: args.scheduleIds },
      appointmentDate: args.date,
      status: { notIn: ['Cancelled', 'NoShow', 'Completed'] }
    },
    orderBy: { queueNumber: 'asc' },
    take: 100
  })
}
