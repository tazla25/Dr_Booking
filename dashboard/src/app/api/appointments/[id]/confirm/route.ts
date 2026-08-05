// /home/z/my-project/src/app/api/appointments/[id]/confirm/route.ts
//
// Confirms a patient-initiated booking (status: Pending → Confirmed).
//
// Flow:
//   1. Patient books via WhatsApp bot → appointment created with status='Pending'
//      (queue number IS assigned at creation time for race-safety, but the
//      patient doesn't see it yet).
//   2. Doctor/compounder opens dashboard, sees the Pending appointment, clicks
//      "Confirm" — this endpoint is called.
//   3. This endpoint:
//        - Verifies ownership (canAccessDoctor)
//        - Sets status='Confirmed'
//        - Sends the patient their token number + live tracking link via
//          the bot's /api/notify endpoint (APPT_CONFIRMED_TRACKER message)
//   4. Patient receives the WhatsApp message with their token and tracker URL.
//
// If the appointment is already Confirmed, this is idempotent — we just
// re-send the tracker message (useful if the patient lost the original).

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { notifyPatients, getPatientLang } from '@/lib/bot-notify'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const existing = await db.appointment.findUnique({
    where: { id },
    include: {
      schedule: { include: { doctor: true } },
      doctor: true,
    },
  })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  // Verify ownership (doctor owns this schedule; compounder is delegated to this doctor)
  if (!(await canAccessDoctor(user, existing.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  // Only allow confirming Pending appointments. If already Confirmed, treat as
  // a re-send of the tracker message (idempotent).
  const wasPending = existing.status === 'Pending'
  if (existing.status === 'Completed' || existing.status === 'Cancelled' || existing.status === 'NoShow') {
    return Response.json(
      { error: 'invalid_state', message: `Cannot confirm an appointment that is ${existing.status}` },
      { status: 409 }
    )
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: 'Confirmed' },
    include: {
      schedule: { include: { doctor: true } },
      doctor: true,
    },
  })

  await audit(user, 'appointment.confirm', id, `Confirmed appointment for ${updated.patientName} (token #${updated.queueNumber})`)

  // Build the localized tracker message and send it to the patient.
  // The patient learns their token number and gets the live tracking link here —
  // NOT at booking time (booking only sends BOOKING_RECEIVED without a token).
  const lang = await getPatientLang(updated.patientPhone, db)
  const trackerUrl = `${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${updated.scheduleId}&date=${updated.appointmentDate}`
  let message: string
  if (lang === 'en') {
    message = `✅ *Appointment Confirmed!*\n\n👤 Name: ${updated.patientName}\n📅 Date: ${updated.appointmentDate}\n🔢 Your Token: *#${updated.queueNumber}*\n\nSee live queue status:\n${trackerUrl}`
  } else if (lang === 'hi') {
    message = `✅ *अपॉइंटमेंट की पुष्टि हुई!*\n\n👤 नाम: ${updated.patientName}\n📅 तारीख: ${updated.appointmentDate}\n🔢 आपका टोकन: *#${updated.queueNumber}*\n\nलाइव कतार स्थिति देखें:\n${trackerUrl}`
  } else {
    message = `✅ *অ্যাপয়েন্টমেন্ট নিশ্চিত!*\n\n👤 নাম: ${updated.patientName}\n📅 তারিখ: ${updated.appointmentDate}\n🔢 আপনার টোকেন: *#${updated.queueNumber}*\n\nলাইভ কিউ স্ট্যাটাস দেখুন:\n${trackerUrl}`
  }

  const notifyResult = await notifyPatients([updated.patientPhone], message)

  return Response.json({
    appointment: updated,
    notification: notifyResult,
    wasPending,
  })
}
