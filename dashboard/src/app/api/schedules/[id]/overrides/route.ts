// /home/z/my-project/src/app/api/schedules/[id]/overrides/route.ts
//
// Phase 1 reform (Task 1.4): Schedule overrides.
//
// GET    /api/schedules/[id]/overrides?from=&to=
//   → list overrides for the schedule (default: today → +30 days)
//
// POST   /api/schedules/[id]/overrides
//   body: { date: 'YYYY-MM-DD', type: 'CLOSED'|'MODIFIED_HOURS'|'SPECIAL',
//           newStartTime?, newEndTime?, reason? }
//   → upsert an override for that date
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { formatInTimeZone } from 'date-fns-tz'
import { z } from 'zod'

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  type: z.enum(['CLOSED', 'MODIFIED_HOURS', 'SPECIAL']),
  newStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  newEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // Verify ownership of the schedule's doctor
  const schedule = await db.schedule.findUnique({
    where: { id },
    select: { doctorId: true },
  })
  if (!schedule) return Response.json({ error: 'not_found' }, { status: 404 })
  if (!(await canAccessDoctor(user, schedule.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const today = formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd')
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const from = url.searchParams.get('from') || today
  const to = url.searchParams.get('to') || future

  const overrides = await db.scheduleOverride.findMany({
    where: { scheduleId: id, date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  })

  return Response.json({ overrides })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // Verify ownership
  const schedule = await db.schedule.findUnique({
    where: { id },
    select: { doctorId: true, dayOfWeek: true },
  })
  if (!schedule) return Response.json({ error: 'not_found' }, { status: 404 })
  if (!(await canAccessDoctor(user, schedule.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  if (parsed.type === 'MODIFIED_HOURS' && (!parsed.newStartTime || !parsed.newEndTime)) {
    return Response.json(
      { error: 'invalid_input', message: 'MODIFIED_HOURS requires newStartTime and newEndTime' },
      { status: 400 }
    )
  }

  const override = await db.scheduleOverride.upsert({
    where: { scheduleId_date: { scheduleId: id, date: parsed.date } },
    update: {
      type: parsed.type,
      newStartTime: parsed.type === 'CLOSED' ? null : parsed.newStartTime || null,
      newEndTime: parsed.type === 'CLOSED' ? null : parsed.newEndTime || null,
      reason: parsed.reason || null,
      createdBy: user.id,
    },
    create: {
      scheduleId: id,
      date: parsed.date,
      type: parsed.type,
      newStartTime: parsed.type === 'CLOSED' ? null : parsed.newStartTime || null,
      newEndTime: parsed.type === 'CLOSED' ? null : parsed.newEndTime || null,
      reason: parsed.reason || null,
      createdBy: user.id,
    },
  })

  await audit(user, 'schedule.override', id, `${parsed.type} on ${parsed.date}${parsed.reason ? `: ${parsed.reason}` : ''}`)

  // If closing today, return the list of affected appointments so the caller
  // can notify them via the bot. We also try to send notifications directly
  // via the bot's /api/notify endpoint (best-effort, non-blocking).
  let affectedAppointments: { id: string; patientName: string; patientPhone: string; queueNumber: number }[] = []
  if (parsed.type === 'CLOSED') {
    const today = formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd')
    if (parsed.date === today) {
      affectedAppointments = await db.appointment.findMany({
        where: {
          scheduleId: id,
          appointmentDate: parsed.date,
          status: { in: ['Confirmed', 'Pending'] },
        },
        select: { id: true, patientName: true, patientPhone: true, queueNumber: true },
      })

      // Best-effort: notify affected patients via the bot
      if (affectedAppointments.length > 0) {
        const botUrl = process.env.BOT_API_URL || process.env.PUBLIC_URL || process.env.DASHBOARD_URL
        if (botUrl && process.env.BOT_API_SECRET) {
          // Fetch each patient's language preference so we can send the
          // closure notice in their chosen language instead of always Bengali.
          const phoneToLang: Record<string, string> = {}
          try {
            const sessions = await db.botSession.findMany({
              where: { chatId: { in: affectedAppointments.map((a) => a.patientPhone) } },
              select: { chatId: true, lang: true, sessionData: true },
            })
            for (const s of sessions) {
              let l = s.lang || 'bn'
              if (s.sessionData) {
                try {
                  const parsed = JSON.parse(s.sessionData)
                  if (parsed.lang) l = parsed.lang
                } catch { /* ignore */ }
              }
              phoneToLang[s.chatId] = l
            }
          } catch { /* ignore — fall back to 'bn' for everyone */ }

          const buildClosureMessage = (lang: string) => {
            const reasonLine = parsed.reason
              ? (lang === 'en'
                  ? `\nReason: ${parsed.reason}`
                  : lang === 'hi'
                  ? `\nकारण: ${parsed.reason}`
                  : `\nকারণ: ${parsed.reason}`)
              : ''
            if (lang === 'en') {
              return `⚠️ *Chamber Closed*\n\nThe chamber will be closed today (${parsed.date}).${reasonLine}\n\nSend /book to book for a new date.`
            }
            if (lang === 'hi') {
              return `⚠️ *चैंबर बंद*\n\nआज (${parsed.date}) चैंबर बंद रहेगा।${reasonLine}\n\nनई तारीख के लिए /book भेजें।`
            }
            return `⚠️ *চেম্বার বন্ধ*\n\nআজ (${parsed.date}) চেম্বার বন্ধ থাকবে।${reasonLine}\n\nনতুন তারিখে বুক করতে /book পাঠান।`
          }

          // Group recipients by language so we send one localized message per patient
          for (const appt of affectedAppointments) {
            const lang = phoneToLang[appt.patientPhone] || 'bn'
            const message = buildClosureMessage(lang)
            // Fire-and-forget — don't block the API response on notifications
            fetch(`${botUrl.replace(/\/$/, '')}/api/notify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.BOT_API_SECRET}`,
              },
              body: JSON.stringify({ chatIds: [appt.patientPhone], text: message }),
            }).catch((err) => {
              console.error(`Failed to notify patient ${appt.patientPhone} of closure:`, err)
            })
          }
        }
      }
    }
  }

  return Response.json({ override, affectedAppointments }, { status: 201 })
}
