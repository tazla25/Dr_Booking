// /home/z/my-project/src/app/api/feedback/route.ts (Task 2.1)
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDoctorScope } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 365)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500)
  const doctorIdFilter = url.searchParams.get('doctorId') || undefined
  const { filter: scope } = await getDoctorScope(user)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const where = { createdAt: { gte: since }, ...scope, ...(doctorIdFilter ? { appointment: { doctorId: doctorIdFilter } } : {}) }
  const [feedback, totalCount] = await Promise.all([
    db.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: { appointment: { select: { patientName: true, patientPhone: true, appointmentDate: true, doctor: { select: { id: true, fullName: true, specialization: true } } } } } }),
    db.feedback.count({ where }),
  ])
  const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const f of feedback) { ratingCounts[f.rating] = (ratingCounts[f.rating] || 0) + 1; sum += f.rating }
  const averageRating = feedback.length > 0 ? sum / feedback.length : 0
  const promoters = ratingCounts[5] || 0, passives = ratingCounts[4] || 0, detractors = (ratingCounts[1] || 0) + (ratingCounts[2] || 0) + (ratingCounts[3] || 0)
  const nps = feedback.length > 0 ? Math.round(((promoters - detractors) / feedback.length) * 100) : 0
  return Response.json({ feedback, stats: { total: totalCount, averageRating: Number(averageRating.toFixed(2)), ratingCounts, promoters, passives, detractors, nps } })
}
const bodySchema = z.object({ appointmentId: z.string().min(1), rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() })
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  let parsed
  try { parsed = bodySchema.parse(await req.json()) } catch (e) { return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 }) }
  const appt = await db.appointment.findUnique({ where: { id: parsed.appointmentId }, select: { id: true, status: true } })
  if (!appt) return Response.json({ error: 'not_found' }, { status: 404 })
  if (appt.status !== 'Completed') return Response.json({ error: 'invalid_state', message: 'Appointment must be completed' }, { status: 400 })
  const existing = await db.feedback.findUnique({ where: { appointmentId: parsed.appointmentId } })
  if (existing) return Response.json({ error: 'already_exists' }, { status: 409 })
  const created = await db.feedback.create({ data: { appointmentId: parsed.appointmentId, rating: parsed.rating, comment: parsed.comment || null } })
  return Response.json({ feedback: created }, { status: 201 })
}
