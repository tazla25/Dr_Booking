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
      doctorId: user.doctorId,
      doctor: user.doctor
        ? {
            id: user.doctor.id,
            fullName: user.doctor.fullName,
            specialization: user.doctor.specialization,
          }
        : null,
      lastLoginAt: user.lastLoginAt,
    },
  })
}
