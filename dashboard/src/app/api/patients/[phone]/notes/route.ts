// /home/z/my-project/src/app/api/patients/[phone]/notes/route.ts
// Patient Notes API — CRUD for internal notes about a patient.
// GET  /api/patients/:phone/notes — list notes for a patient
// POST /api/patients/:phone/notes — add a new note

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { phone } = await ctx.params
  const decodedPhone = decodeURIComponent(phone)

  // Build scope filter — notes are visible if the author is the same doctor
  // or a compounder delegated to the same doctor, or super admin.
  let authorFilter: Record<string, unknown> = {}
  if (user.role === 'SUPER_ADMIN') {
    authorFilter = {}
  } else if (user.role === 'DOCTOR') {
    authorFilter = { authorId: user.id }
  } else if (user.role === 'COMPOUNDER') {
    // Compounders see notes from their delegated doctor and themselves
    authorFilter = {
      OR: [
        { authorId: user.id },
        { author: { delegatedDoctorId: user.delegatedDoctorId } },
      ],
    }
  }

  const notes = await db.patientNote.findMany({
    where: {
      patientPhone: decodedPhone,
      ...authorFilter,
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
    orderBy: [{ isImportant: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  })

  return Response.json({ notes })
}

const createSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  isImportant: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { phone } = await ctx.params
  const decodedPhone = decodeURIComponent(phone)

  let parsed
  try {
    parsed = createSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const note = await db.patientNote.create({
    data: {
      patientPhone: decodedPhone,
      authorId: user.id,
      note: parsed.note,
      isImportant: parsed.isImportant,
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
  })

  return Response.json({ note }, { status: 201 })
}
