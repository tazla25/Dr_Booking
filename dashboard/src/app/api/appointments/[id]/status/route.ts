// /home/z/my-project/src/app/api/appointments/[id]/status/route.ts
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit, canAccessDoctor } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { appointmentStatusSchema } from '@/lib/validators'
import { notifyPatients, getPatientLang } from '@/lib/bot-notify'
import { z } from 'zod'

const bodySchema = z.object({ status: appointmentStatusSchema })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 })
  }

  const existing = await db.appointment.findUnique({
    where: { id },
    include: { schedule: { include: { doctor: true } } },
  })
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  // Verify ownership using the new role-based scoping
  if (!(await canAccessDoctor(user, existing.doctorId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const updated = await db.appointment.update({
    where: { id },
    data: { status: parsed.status },
  })
  await audit(user, 'appointment.status', id, `Marked as ${parsed.status}`)

  // When a doctor/compounder cancels a patient's appointment, notify the
  // patient via WhatsApp so they don't show up expecting to be seen.
  // (Other status transitions — Completed, NoShow — don't need a patient
  // notification; the patient already knows they were seen / didn't show.)
  if (parsed.status === 'Cancelled' && existing.status !== 'Cancelled') {
    const lang = await getPatientLang(existing.patientPhone, db)
    const doctorName = existing.schedule?.doctor?.fullName || ''
    const doctorLine = doctorName ? ` (${doctorName})` : ''
    const dateLine = existing.appointmentDate
    let msg: string
    if (existing.status === 'Pending') {
      if (lang === 'en') {
        msg = `❌ *Booking Declined*\n\nYour booking request${doctorLine} for ${dateLine} has been declined by the clinic.\n\nSend /book to schedule a new appointment.`
      } else if (lang === 'hi') {
        msg = `❌ *बुकिंग अस्वीकृत*\n\nआपका बुकिंग अनुरोध${doctorLine} (${dateLine}) क्लिनिक द्वारा अस्वीकृत कर दिया गया है।\n\nनया अपॉइंटमेंट बुक करने के लिए /book भेजें।`
      } else {
        msg = `❌ *বুকিং বাতিল*\n\nআপনার বুকিং অনুরোধ${doctorLine} (${dateLine}) ক্লিনিক কর্তৃক প্রত্যাখ্যান করা হয়েছে।\n\nনতুন অ্যাপয়েন্টমেন্ট বুক করতে /book পাঠান।`
      }
    } else {
      if (lang === 'en') {
        msg = `❌ *Appointment Cancelled*\n\nYour appointment${doctorLine} on ${dateLine} has been cancelled by the clinic.\n\nSend /book to schedule a new appointment.`
      } else if (lang === 'hi') {
        msg = `❌ *अपॉइंटमेंट रद्द*\n\nआपका अपॉइंटमेंट${doctorLine} (${dateLine}) क्लिनिक द्वारा रद्द कर दिया गया है।\n\nनया अपॉइंटमेंट बुक करने के लिए /book भेजें।`
      } else {
        msg = `❌ *অ্যাপয়েন্টমেন্ট বাতিল*\n\nআপনার অ্যাপয়েন্টমেন্ট${doctorLine} (${dateLine}) ক্লিনিক কর্তৃক বাতিল করা হয়েছে।\n\nনতুন অ্যাপয়েন্টমেন্ট বুক করতে /book পাঠান।`
      }
    }
    // Fire-and-forget — don't block the API response on the notification
    notifyPatients([existing.patientPhone], msg).catch(() => {})
  }

  return Response.json({ appointment: updated })
}
