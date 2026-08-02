// /home/z/my-project/src/lib/api-helpers.ts
// Shared helpers for API routes.

import { NextResponse } from 'next/server'
import { getCurrentUser, getIpAddress } from './auth'
import { db } from './db'

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      json: (body: unknown, status = 401) =>
        NextResponse.json({ error: 'unauthorized', ...(body as any) }, { status }),
    }
  }
  return { user, json: null }
}

export async function audit(user: { id: string }, action: string, target?: string, detail?: string) {
  await db.auditLog.create({
    data: { adminUserId: user.id, action, target, detail },
  })
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

export function extractIp(req: Request): string | undefined {
  return getIpAddress(req)
}
