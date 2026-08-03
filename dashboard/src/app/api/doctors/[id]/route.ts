// /home/z/my-project/src/app/api/doctors/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { doctorSchema } from '@/lib/validators'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // Scope: only owner / delegated compounder / super admin can view
  if (!(await canAccessDoctor(user, id))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const doctor = await db.doctor.findUnique({
    where: { id },
    include: { schedules: true, _count: { select: { appointments: true } } },
  })
  if (!doctor) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json({ doctor })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // Only the owner doctor or super admin can edit
  if (!(await canAccessDoctor(user, id))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed
  try {
    parsed = doctorSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const updated = await db.doctor.update({
    where: { id },
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
  await audit(user, 'doctor.update', id, `Updated doctor ${updated.fullName}`)
  return Response.json({ doctor: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // Only the owner doctor or super admin can delete
  if (!(await canAccessDoctor(user, id))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.doctor.delete({ where: { id } })
  await audit(user, 'doctor.delete', id, `Deleted doctor ${id}`)
  return NextResponse.json({ ok: true })
}
