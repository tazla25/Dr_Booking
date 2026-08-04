// /home/z/my-project/src/app/api/patients/[phone]/receipts/route.ts
// Patient Receipts API — returns all completed appointments (with receipt data) for a patient.
// GET /api/patients/:phone/receipts — list all completed appointments that can have receipts.

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
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

  // Fetch all completed appointments for this patient (scoped)
  const appointments = await db.appointment.findMany({
    where: {
      patientPhone: decodedPhone,
      status: 'Completed',
      ...scopeFilter,
    },
    orderBy: { appointmentDate: 'desc' },
    select: {
      id: true,
      appointmentDate: true,
      queueNumber: true,
      doctor: {
        select: {
          id: true,
          fullName: true,
          specialization: true,
          fee: true,
        },
      },
      schedule: {
        select: { clinicName: true },
      },
      feedback: {
        select: { rating: true, comment: true },
      },
    },
    take: 50,
  })

  const receipts = appointments.map((a) => ({
    appointmentId: a.id,
    receiptNo: `DRB-${a.id.slice(-8).toUpperCase()}`,
    date: a.appointmentDate,
    queueNumber: a.queueNumber,
    doctorName: a.doctor.fullName,
    specialization: a.doctor.specialization,
    clinic: a.schedule?.clinicName || 'Clinic',
    fee: a.doctor.fee,
    rating: a.feedback?.rating || null,
    comment: a.feedback?.comment || null,
  }))

  const totalRevenue = receipts.reduce((sum, r) => sum + r.fee, 0)

  return Response.json({
    receipts,
    total: receipts.length,
    totalRevenue,
  })
}
