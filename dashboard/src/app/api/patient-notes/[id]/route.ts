// /home/z/my-project/src/app/api/patient-notes/[id]/route.ts
// Patient Note detail API — update or delete a single note.
// PATCH /api/patient-notes/:id — update note text or importance
// DELETE /api/patient-notes/:id — delete a note

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  const existing = await db.patientNote.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  // Only the author or super admin can edit
  if (existing.authorId !== user.id && user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const updateSchema = z.object({
    note: z.string().trim().min(1).max(2000).optional(),
    isImportant: z.boolean().optional(),
  })

  let parsed
  try {
    parsed = updateSchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const updated = await db.patientNote.update({
    where: { id },
    data: {
      ...(parsed.note !== undefined && { note: parsed.note }),
      ...(parsed.isImportant !== undefined && { isImportant: parsed.isImportant }),
    },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
  })

  return Response.json({ note: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  const existing = await db.patientNote.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  // Only the author or super admin can delete
  if (existing.authorId !== user.id && user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.patientNote.delete({ where: { id } })

  return Response.json({ ok: true })
}
