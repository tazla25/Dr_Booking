// /home/z/my-project/src/app/api/admin/invite-compounder/route.ts (V8-2)
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'

const bodySchema = z.object({
  compounderPhone: z.string().regex(/^\+\d{8,15}$/, 'Phone must be E.164 format'),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'DOCTOR') return Response.json({ error: 'forbidden', message: 'Only doctors can invite compounders' }, { status: 403 })
  if (user.verificationStatus !== 'VERIFIED') return Response.json({ error: 'not_verified', message: 'Your account is not verified' }, { status: 403 })

  let parsed
  try { parsed = bodySchema.parse(await req.json()) } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  // Check for duplicate
  const existing = await db.adminUser.findUnique({ where: { phone: parsed.compounderPhone } })
  if (existing) return Response.json({ error: 'duplicate', message: 'An account with this phone already exists' }, { status: 409 })

  // Get the doctor's owned Doctor profile
  const ownedDoctor = await db.doctor.findUnique({ where: { ownerAdminId: user.id } })
  if (!ownedDoctor) return Response.json({ error: 'no_doctor_profile', message: 'You do not have a doctor profile yet' }, { status: 403 })

  // Create the compounder
  const compounder = await db.adminUser.create({
    data: {
      name: `Compounder (${parsed.compounderPhone})`,
      phone: parsed.compounderPhone,
      role: 'COMPOUNDER',
      verificationStatus: 'VERIFIED',
      delegatedDoctorId: ownedDoctor.id,
      invitedBy: user.phone,
      invitedAt: new Date(),
      isActive: true,
    },
  })

  await audit(user, 'compounder.invite', compounder.id, `Invited compounder ${parsed.compounderPhone}`)
  return Response.json({ compounder }, { status: 201 })
}
