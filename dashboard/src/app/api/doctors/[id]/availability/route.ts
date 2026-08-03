// /home/z/my-project/src/app/api/doctors/[id]/availability/route.ts
// Strategy v2: Live doctor availability toggle (IN/OUT)
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'

const bodySchema = z.object({
  isAvailableNow: z.boolean(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  if (!(await canAccessDoctor(user, id))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed
  try { parsed = bodySchema.parse(await req.json()) } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const updated = await db.doctor.update({
    where: { id },
    data: { isAvailableNow: parsed.isAvailableNow },
    select: { id: true, fullName: true, isAvailableNow: true },
  })

  await audit(user, 'doctor.availability', id, `Set availability to ${parsed.isAvailableNow ? 'IN' : 'OUT'}`)
  return NextResponse.json({ doctor: updated })
}
