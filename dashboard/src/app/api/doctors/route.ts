// /home/z/my-project/src/app/api/doctors/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { doctorSchema } from '@/lib/validators'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const doctors = await db.doctor.findMany({
    orderBy: { fullName: 'asc' },
    include: {
      _count: {
        select: { schedules: true, appointments: true },
      },
    },
  })
  return Response.json({ doctors })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 })

  let parsed
  try {
    parsed = doctorSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const created = await db.doctor.create({
    data: {
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
