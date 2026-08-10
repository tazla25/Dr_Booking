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
    ]
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

  const where = getDoctorScope(context.user)
  const totalAppointments = await context.entities.Appointment.count({ where })
  const appointments = await context.entities.Appointment.findMany({ where })

  let revenue = 0
  // Simplified revenue calculation for demo

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
    orderBy: { appointmentDate: 'desc' }
  })

  const notes = await context.entities.PatientNote.findMany({
    where: { patientPhone: args.phone },
    include: { author: true },
    orderBy: { createdAt: 'desc' }
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
    include: { doctor: true, schedule: true }
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
  // Simplified for demo
  return []
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
    orderBy: { queueNumber: 'asc' }
  })
}
