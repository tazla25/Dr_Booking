// /home/z/my-project/src/app/api/patients/[phone]/route.ts
// Get a single patient's full appointment history by phone number.
// GET /api/patients/:phone — returns patient profile + all appointments.

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { phone } = await ctx.params
  const decodedPhone = decodeURIComponent(phone)

  // Build scope filter
  let scopeFilter: Record<string, unknown> = {}
  if (user.role === 'DOCTOR') {
    const ownedId = user.ownedDoctor?.id
    scopeFilter = ownedId ? { doctorId: ownedId } : { doctorId: '__none__' }
  } else if (user.role === 'COMPOUNDER') {
    scopeFilter = user.delegatedDoctorId ? { doctorId: user.delegatedDoctorId } : { doctorId: '__none__' }
  }

  // Fetch all appointments for this patient (scoped)
  const appointments = await db.appointment.findMany({
    where: {
      patientPhone: decodedPhone,
      ...scopeFilter,
    },
    orderBy: { appointmentDate: 'desc' },
    select: {
      id: true,
      patientName: true,
      patientPhone: true,
      appointmentDate: true,
      queueNumber: true,
      status: true,
      notes: true,
      createdAt: true,
      doctor: {
        select: { id: true, fullName: true, specialization: true },
      },
      schedule: {
        select: { id: true, clinicName: true, startTime: true, endTime: true },
      },
      feedback: {
        select: { rating: true, comment: true, createdAt: true },
      },
    },
    take: 100,
  })

  if (appointments.length === 0) {
    return Response.json({ error: 'not_found', message: 'No appointments found for this patient' }, { status: 404 })
  }

  // Build patient profile
  const total = appointments.length
  const completed = appointments.filter((a) => a.status === 'Completed').length
  const noShow = appointments.filter((a) => a.status === 'NoShow').length
  const cancelled = appointments.filter((a) => a.status === 'Cancelled').length
  const confirmed = appointments.filter((a) => a.status === 'Confirmed').length

  const doctorSet = new Map<string, string>()
  for (const a of appointments) {
    if (a.doctor) doctorSet.set(a.doctor.fullName, a.doctor.specialization)
  }

  const allFeedback = appointments
    .filter((a) => a.feedback)
    .map((a) => ({
      rating: a.feedback!.rating,
      comment: a.feedback!.comment,
      date: a.appointmentDate,
      doctor: a.doctor?.fullName || 'Unknown',
    }))

  const avgRating = allFeedback.length > 0
    ? allFeedback.reduce((s, f) => s + f.rating, 0) / allFeedback.length
    : 0

  return Response.json({
    patient: {
      phone: decodedPhone,
      name: appointments[0].patientName,
      totalAppointments: total,
      completed,
      noShow,
      cancelled,
      confirmed,
      noShowRate: total > 0 ? Number(((noShow / total) * 100).toFixed(1)) : 0,
      completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
      doctors: Array.from(doctorSet.entries()).map(([name, spec]) => ({ name, specialization: spec })),
      firstVisit: appointments[appointments.length - 1]?.appointmentDate || '',
      lastVisit: appointments[0]?.appointmentDate || '',
      averageRating: Number(avgRating.toFixed(2)),
      feedbackCount: allFeedback.length,
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      date: a.appointmentDate,
      queueNumber: a.queueNumber,
      status: a.status,
      notes: a.notes,
      doctor: a.doctor,
      clinic: a.schedule?.clinicName || null,
      time: a.schedule ? `${a.schedule.startTime}–${a.schedule.endTime}` : null,
      feedback: a.feedback,
    })),
    feedback: allFeedback,
  })
}
