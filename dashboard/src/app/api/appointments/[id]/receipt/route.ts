// /home/z/my-project/src/app/api/appointments/[id]/receipt/route.ts
// Receipt API — generates receipt data for a completed appointment.
// GET /api/appointments/:id/receipt — returns receipt data with doctor fee, patient info, etc.

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  const appointment = await db.appointment.findUnique({
    where: { id },
    include: {
      doctor: {
        select: {
          id: true,
          fullName: true,
          specialization: true,
          phone: true,
          email: true,
          fee: true,
          timezone: true,
        },
      },
      schedule: {
        select: {
          id: true,
          clinicName: true,
          clinicAddress: true,
          startTime: true,
          endTime: true,
          pinCode: true,
          landmark: true,
        },
      },
      feedback: {
        select: { rating: true, comment: true },
      },
    },
  })

  if (!appointment) return Response.json({ error: 'not_found' }, { status: 404 })

  // Check access
  if (!(await canAccessDoctor(user, appointment.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  // Generate receipt number (based on appointment ID + date)
  const receiptNo = `DRB-${appointment.id.slice(-8).toUpperCase()}`
  const receiptDate = new Date().toISOString()

  return Response.json({
    receipt: {
      receiptNo,
      receiptDate,
      appointment: {
        id: appointment.id,
        date: appointment.appointmentDate,
        queueNumber: appointment.queueNumber,
        status: appointment.status,
        token: appointment.token,
        notes: appointment.notes,
        createdAt: appointment.createdAt,
      },
      patient: {
        name: appointment.patientName,
        phone: appointment.patientPhone,
      },
      doctor: {
        fullName: appointment.doctor.fullName,
        specialization: appointment.doctor.specialization,
        phone: appointment.doctor.phone,
        email: appointment.doctor.email,
      },
      clinic: {
        name: appointment.schedule?.clinicName || 'Clinic',
        address: appointment.schedule?.clinicAddress || '',
        pinCode: appointment.schedule?.pinCode || null,
        landmark: appointment.schedule?.landmark || null,
        timing: appointment.schedule ? `${appointment.schedule.startTime}–${appointment.schedule.endTime}` : null,
      },
      payment: {
        fee: appointment.doctor.fee,
        currency: 'INR',
        status: appointment.status === 'Completed' ? 'Paid' : 'Pending',
        method: 'Cash', // Default — could be extended for online payments
      },
      feedback: appointment.feedback,
      generatedBy: {
        name: user.name,
        role: user.role,
      },
    },
  })
}
