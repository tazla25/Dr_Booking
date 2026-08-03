// /home/z/my-project/src/app/api/auth/me/route.ts
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ user: null }, { status: 200 })
  }
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      verificationStatus: user.verificationStatus,
      medicalRegNumber: user.medicalRegNumber,
      specialization: user.specialization,
      phone: user.phone,
      telegramChatId: user.telegramChatId,
      whatsappNumber: user.whatsappNumber,
      // Doctor-scoped info: which Doctor profile this user owns (DOCTOR) or is delegated to (COMPOUNDER)
      ownedDoctorId: user.ownedDoctor?.id ?? null,
      delegatedDoctorId: user.delegatedDoctorId,
      doctor: user.ownedDoctor
        ? {
            id: user.ownedDoctor.id,
            fullName: user.ownedDoctor.fullName,
            specialization: user.ownedDoctor.specialization,
          }
        : user.delegatedDoctor
        ? {
            id: user.delegatedDoctor.id,
            fullName: user.delegatedDoctor.fullName,
            specialization: user.delegatedDoctor.specialization,
          }
        : null,
      lastLoginAt: user.lastLoginAt,
    },
  })
}
