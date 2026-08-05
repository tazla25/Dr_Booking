// /home/z/my-project/src/app/api/admin/verify-doctor/route.ts (Task 1.2)
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { audit } from '@/lib/api-helpers'
import { db } from '@/lib/db'
import { z } from 'zod'
import { notifyPatients } from '@/lib/bot-notify'

const bodySchema = z.object({
  doctorAdminId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'SUPER_ADMIN') return Response.json({ error: 'forbidden' }, { status: 403 })

  let parsed
  try { parsed = bodySchema.parse(await req.json()) } catch (e) { return Response.json({ error: 'invalid_input', details: (e as Error).message }, { status: 400 }) }

  const doctor = await db.adminUser.findUnique({ where: { id: parsed.doctorAdminId }, include: { ownedDoctor: true } })
  if (!doctor || doctor.role !== 'DOCTOR') return Response.json({ error: 'not_found' }, { status: 404 })
  if (doctor.verificationStatus !== 'PENDING') return Response.json({ error: 'invalid_state', message: `Already ${doctor.verificationStatus}` }, { status: 409 })

  // Determine the doctor's WhatsApp chatId (prefer whatsappNumber, fall back to phone).
  // This is where we send the approval/rejection notification.
  const doctorChatId = doctor.whatsappNumber || doctor.phone

  if (parsed.action === 'approve') {
    const updated = await db.adminUser.update({
      where: { id: parsed.doctorAdminId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedBy: user.id },
    })
    let doctorProfile = doctor.ownedDoctor
    if (!doctorProfile) {
      doctorProfile = await db.doctor.create({ data: { ownerAdminId: doctor.id, fullName: doctor.name, specialization: doctor.specialization || 'General Physician', phone: doctor.phone, isActive: true } })
    }
    await audit(user, 'verification.approve', doctor.id, `Approved doctor ${doctor.name} (${doctor.medicalRegNumber})`)

    // Notify the doctor via WhatsApp that their account was approved.
    // They can now /login and /invite compounders.
    if (doctorChatId) {
      // The doctor's BotSession lang is usually 'bn' (default) since they
      // registered via the bot. We send a bilingual-friendly message but
      // lead with Bengali since that's the bot default for new registrants.
      // The message mirrors VERIFICATION_APPROVED in src/utils/messages.js.
      const msg = `✅ *অভিনন্দন!*\n\nআপনার ডাক্তার অ্যাকাউন্ট অনুমোদিত হয়েছে। এখন আপনি /login দিয়ে লগইন করতে পারেন এবং /invite দিয়ে কম্পাউন্ডার ইনভাইট করতে পারেন।\n\n✅ *Congratulations!*\n\nYour doctor account has been approved. You can now /login and use /invite to add compounders.`
      // Fire-and-forget — don't fail the API call if the bot notification fails
      notifyPatients([doctorChatId], msg).catch(() => {})
    }

    return Response.json({ ok: true, adminUser: updated, doctor: doctorProfile })
  } else {
    const updated = await db.adminUser.update({
      where: { id: parsed.doctorAdminId },
      data: {
        verificationStatus: 'REJECTED',
        verifiedBy: user.id,
        verificationDocs: { ...(doctor.verificationDocs as object | null || {}), rejectionReason: parsed.reason || null },
      },
    })
    await audit(user, 'verification.reject', doctor.id, `Rejected doctor ${doctor.name}. Reason: ${parsed.reason || 'No reason'}`)

    // Notify the doctor via WhatsApp that their account was rejected.
    if (doctorChatId) {
      const reasonLine = parsed.reason ? `\n\nকারণ: ${parsed.reason}\nReason: ${parsed.reason}` : ''
      const msg = `❌ আপনার ডাক্তার অ্যাকাউন্ট অনুমোদিত হয়নি।${reasonLine}\n\n❌ Your doctor account was not approved.${reasonLine}\n\nবিস্তারিত জানতে সাপোর্টে যোগাযোগ করুন / Contact support for details.`
      notifyPatients([doctorChatId], msg).catch(() => {})
    }

    return Response.json({ ok: true, adminUser: updated })
  }
}
