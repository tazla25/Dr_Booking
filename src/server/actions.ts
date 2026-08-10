import { HttpError } from 'wasp/server'

function getDoctorScope(user: any) {
  if (user.role === 'SUPER_ADMIN') return {}
  if (user.role === 'DOCTOR') return { doctor: { ownerAdminId: user.id } }
  if (user.role === 'COMPOUNDER') return { doctorId: user.delegatedDoctorId }
  return { doctorId: 'NONE' }
}

function getDoctorIdScope(user: any) {
  if (user.role === 'SUPER_ADMIN') return {}
  if (user.role === 'DOCTOR') return { ownerAdminId: user.id }
  if (user.role === 'COMPOUNDER') return { id: user.delegatedDoctorId }
  return { id: 'NONE' }
}

export const confirmAppointment = async (args: { appointmentId: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  const appointment = await context.entities.Appointment.findUnique({
    where: { id: args.appointmentId }
  })

  if (!appointment) throw new HttpError(404, 'Appointment not found')

  return context.entities.Appointment.update({
    where: { id: args.appointmentId },
    data: { status: 'Confirmed' }
  })
}

export const rescheduleAppointment = async (args: { appointmentId: string, newDate: string, newScheduleId: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  // Basic implementation
  return context.entities.Appointment.update({
    where: { id: args.appointmentId },
    data: { appointmentDate: args.newDate, scheduleId: args.newScheduleId }
  })
}

export const updateAppointmentStatus = async (args: { appointmentId: string, status: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.Appointment.update({
    where: { id: args.appointmentId },
    data: { status: args.status }
  })
}

export const createWalkIn = async (args: { scheduleId: string, patientName: string, patientPhone: string, date: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  const schedule = await context.entities.Schedule.findUnique({
    where: { id: args.scheduleId }
  })
  if (!schedule) throw new HttpError(404, 'Schedule not found')

  const count = await context.entities.Appointment.count({
    where: { scheduleId: args.scheduleId, appointmentDate: args.date }
  })

  return context.entities.Appointment.create({
    data: {
      scheduleId: args.scheduleId,
      doctorId: schedule.doctorId,
      patientName: args.patientName,
      patientPhone: args.patientPhone,
      appointmentDate: args.date,
      queueNumber: count + 1,
      source: 'WALK_IN',
      status: 'Confirmed'
    }
  })
}

export const createDoctor = async (args: any, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') throw new HttpError(403)

  return context.entities.Doctor.create({
    data: {
      ownerAdminId: context.user.id,
      ...args
    }
  })
}

export const updateDoctor = async (args: { id: string, data: any }, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.Doctor.update({
    where: { id: args.id },
    data: args.data
  })
}

export const deleteDoctor = async (args: { id: string }, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') throw new HttpError(403)

  return context.entities.Doctor.delete({
    where: { id: args.id }
  })
}

export const createSchedule = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.Schedule.create({
    data: args
  })
}

export const createOverride = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.ScheduleOverride.create({
    data: { ...args, createdBy: context.user.id }
  })
}

export const deleteOverride = async (args: { id: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.ScheduleOverride.delete({
    where: { id: args.id }
  })
}

export const advanceQueue = async (args: { scheduleId: string, date: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  // Implementation depends on logic (e.g. marking next appointment as Completed)
  return true
}

export const createCompounder = async (args: any, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') throw new HttpError(403)

  return context.entities.User.create({
    data: {
      ...args,
      role: 'COMPOUNDER'
    }
  })
}

export const removeCompounder = async (args: { id: string }, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') throw new HttpError(403)

  return context.entities.User.delete({
    where: { id: args.id }
  })
}

export const verifyDoctor = async (args: { id: string }, context: any) => {
  if (!context.user || context.user.role !== 'SUPER_ADMIN') throw new HttpError(403)

  return context.entities.User.update({
    where: { id: args.id },
    data: { verificationStatus: 'VERIFIED' }
  })
}

export const updatePatientNote = async (args: { id: string, note: string, isImportant: boolean }, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.PatientNote.update({
    where: { id: args.id },
    data: { note: args.note, isImportant: args.isImportant }
  })
}

export const deletePatientNote = async (args: { id: string }, context: any) => {
  if (!context.user) throw new HttpError(401)

  return context.entities.PatientNote.delete({
    where: { id: args.id }
  })
}
