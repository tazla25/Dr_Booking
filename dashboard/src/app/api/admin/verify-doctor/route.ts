// /home/z/my-project/src/app/api/admin/verify-doctor/route.ts
//
// Phase 1 reform: Super-admin-only endpoint to approve or reject a pending doctor.
//
// POST /api/admin/verify-doctor
//   Body: { doctorAdminId: string, action: 'approve' | 'reject', reason?: string }
//   Returns: { ok: true, doctor?: Doctor, adminUser: AdminUser }
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'

const bodySchema = z.object({
  doctorAdminId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'forbidden', message: 'Super admin only' }, { status: 403 })
  }

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const doctor = await db.adminUser.findUnique({
    where: { id: parsed.doctorAdminId },
    include: { ownedDoctor: true },
  })

  if (!doctor || doctor.role !== 'DOCTOR') {
    return Response.json({ error: 'not_found', message: 'Doctor not found' }, { status: 404 })
  }

  if (doctor.verificationStatus !== 'PENDING') {
    return Response.json(
      { error: 'invalid_state', message: `Doctor is already ${doctor.verificationStatus}` },
      { status: 409 }
    )
  }

  if (parsed.action === 'approve') {
    // Update the admin user
    const updated = await db.adminUser.update({
      where: { id: parsed.doctorAdminId },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: user.id,
      },
    })

    // Create the Doctor profile if it doesn't exist yet
    let doctorProfile = doctor.ownedDoctor
    if (!doctorProfile) {
      doctorProfile = await db.doctor.create({
        data: {
          ownerAdminId: doctor.id,
          fullName: doctor.name,
          specialization: doctor.specialization || 'General Physician',
          phone: doctor.phone,
          isActive: true,
        },
      })
    }

    await audit(
      user,
      'verification.approve',
      doctor.id,
      `Approved doctor ${doctor.name} (${doctor.medicalRegNumber})`
    )

    return Response.json({ ok: true, adminUser: updated, doctor: doctorProfile })
  } else {
    // Reject
    const updated = await db.adminUser.update({
      where: { id: parsed.doctorAdminId },
      data: {
        verificationStatus: 'REJECTED',
        verifiedBy: user.id,
        // Store the rejection reason in verificationDocs for record-keeping
        verificationDocs: { ...(doctor.verificationDocs as object | null || {}), rejectionReason: parsed.reason || null },
      },
    })

    await audit(
      user,
      'verification.reject',
      doctor.id,
      `Rejected doctor ${doctor.name} (${doctor.medicalRegNumber}). Reason: ${parsed.reason || 'No reason provided'}`
    )

    return Response.json({ ok: true, adminUser: updated })
  }
}
