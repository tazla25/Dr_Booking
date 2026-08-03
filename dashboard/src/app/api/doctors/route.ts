// /home/z/my-project/src/app/api/doctors/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, getDoctorScope } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { doctorSchema } from '@/lib/validators'

// GET /api/doctors — list doctors scoped to current user.
// SUPER_ADMIN sees all; DOCTOR sees own profile; COMPOUNDER sees their delegated doctor.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { filter } = await getDoctorScope(user)

  const doctors = await db.doctor.findMany({
    where: filter,
    orderBy: { fullName: 'asc' },
    include: {
      _count: {
        select: { schedules: true, appointments: true },
      },
    },
  })
  return Response.json({ doctors })
}

// POST /api/doctors — create a new doctor profile.
// Only DOCTOR or SUPER_ADMIN can create. When a DOCTOR creates, ownerAdminId is set automatically.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'DOCTOR' && user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'forbidden', message: 'Only doctors or super admins can create doctor profiles' }, { status: 403 })
  }
  // A doctor can only have ONE owned profile
  if (user.role === 'DOCTOR' && user.ownedDoctor) {
    return Response.json({ error: 'already_exists', message: 'You already have a doctor profile' }, { status: 409 })
  }

  let parsed
  try {
    parsed = doctorSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const created = await db.doctor.create({
    data: {
      ownerAdminId: user.id,
      fullName: parsed.fullName,
      specialization: parsed.specialization,
      phone: parsed.phone || null,
      email: parsed.email || null,
      fee: parsed.fee,
      rating: parsed.rating,
      isActive: parsed.isActive,
    },
  })
  await audit(user, 'doctor.create', created.id, `Created doctor ${created.fullName}`)
  return Response.json({ doctor: created }, { status: 201 })
}
