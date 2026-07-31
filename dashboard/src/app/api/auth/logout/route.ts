// /home/z/my-project/src/app/api/auth/logout/route.ts
import { logout } from '@/lib/auth'

export async function POST() {
  await logout()
  return Response.json({ ok: true })
}
