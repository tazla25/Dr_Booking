// /home/z/my-project/src/app/api/schedules/[id]/overrides/[date]/route.ts
//
// Phase 1 reform (Task 1.4): Remove an override for a specific date.
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; date: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id, date } = await ctx.params

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'invalid_input', message: 'Date must be YYYY-MM-DD' }, { status: 400 })
  }

  // Verify ownership
  const schedule = await db.schedule.findUnique({
    where: { id },
    select: { doctorId: true },
  })
  if (!schedule) return Response.json({ error: 'not_found' }, { status: 404 })
  if (!(await canAccessDoctor(user, schedule.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const result = await db.scheduleOverride.deleteMany({
    where: { scheduleId: id, date },
  })

  if (result.count === 0) {
    return Response.json({ error: 'not_found', message: 'No override for this date' }, { status: 404 })
  }

  await audit(user, 'schedule.override.remove', id, `Removed override for ${date}`)
  return NextResponse.json({ ok: true, deleted: result.count })
}
