// /home/z/my-project/src/lib/api-helpers.ts
// Shared helpers for API routes.
//
// Phase 1 reform: Role-based access control helpers.
//   - requireAuth()      → any authenticated user
//   - requireVerified()  → user with verificationStatus === VERIFIED (or SUPER_ADMIN)
//   - requireDoctor()    → user with role === DOCTOR (verified)
//   - requireSuperAdmin()→ user with role === SUPER_ADMIN
//   - getDoctorScope()   → returns { doctorId } filter for compounders/doctors,
//                          empty filter for super admins

import { NextResponse } from 'next/server'
import { getCurrentUser, getIpAddress } from './auth'
import { db } from './db'

// ---------- Auth helpers ----------

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      json: (_body?: unknown, _status = 401) =>
        NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }
  return { user, json: null }
}

/**
 * Require a verified user. Rejects:
 *   - Unauthenticated
 *   - role=DOCTOR with verificationStatus !== VERIFIED
 *   - role=COMPOUNDER whose delegatedDoctor is suspended or whose ownerAdmin is not verified
 *   - Inactive accounts
 * SUPER_ADMIN bypasses all verification checks.
 */
export async function requireVerified() {
  const auth = await requireAuth()
  if (auth.user) {
    const u = auth.user
    if (u.role === 'SUPER_ADMIN') return auth
    if (u.role === 'DOCTOR' && u.verificationStatus !== 'VERIFIED') {
      return {
        user: null,
        json: (_body?: unknown, _status = 403) =>
          NextResponse.json(
            { error: 'verification_pending', message: 'Doctor account not verified' },
            { status: 403 }
          ),
      }
    }
    if (u.role === 'COMPOUNDER') {
      const doc = u.delegatedDoctor
      const owner = doc?.ownerAdmin
      if (!doc || !doc.isActive || !owner || !owner.isActive || owner.verificationStatus !== 'VERIFIED') {
        return {
          user: null,
          json: (_body?: unknown, _status = 403) =>
            NextResponse.json(
              { error: 'account_suspended', message: 'Compounder access has been revoked' },
              { status: 403 }
            ),
        }
      }
    }
  }
  return auth
}

export async function requireDoctor() {
  const auth = await requireVerified()
  if (auth.user && auth.user.role !== 'DOCTOR') {
    return {
      user: null,
      json: (_body?: unknown, _status = 403) =>
        NextResponse.json({ error: 'forbidden', message: 'Doctor role required' }, { status: 403 }),
    }
  }
  return auth
}

export async function requireSuperAdmin() {
  const auth = await requireAuth()
  if (auth.user && auth.user.role !== 'SUPER_ADMIN') {
    return {
      user: null,
      json: (_body?: unknown, _status = 403) =>
        NextResponse.json({ error: 'forbidden', message: 'Super admin role required' }, { status: 403 }),
    }
  }
  return auth
}

/**
 * Returns the doctorId scope filter for Appointment/Schedule/etc queries:
 *   - COMPOUNDER → { doctorId: delegatedDoctorId }
 *   - DOCTOR     → { doctorId: ownedDoctor.id }
 *   - SUPER_ADMIN→ {} (sees all)
 *
 * If compounder has no delegatedDoctorId or doctor has no ownedDoctor,
 * returns a filter that matches nothing ({ doctorId: '__none__' }).
 *
 * Use this for any model that references Doctor via a `doctorId` foreign key
 * (Appointment, Schedule, ScheduleOverride). For direct Doctor model queries,
 * use getDoctorIdScope() instead.
 */
export async function getDoctorScope(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (user.role === 'SUPER_ADMIN') return { filter: {} as Record<string, string> }

  if (user.role === 'COMPOUNDER') {
    return {
      filter: user.delegatedDoctorId
        ? { doctorId: user.delegatedDoctorId }
        : { doctorId: '__none__' },
    }
  }

  if (user.role === 'DOCTOR') {
    // Look up the owned Doctor profile (cached on the user object)
    const ownedDoctorId = user.ownedDoctor?.id
    if (ownedDoctorId) {
      return { filter: { doctorId: ownedDoctorId } }
    }
    // Fallback: query DB
    const doctor = await db.doctor.findUnique({ where: { ownerAdminId: user.id } })
    return {
      filter: doctor ? { doctorId: doctor.id } : { doctorId: '__none__' },
    }
  }

  return { filter: { doctorId: '__none__' } as Record<string, string> }
}

/**
 * Returns the Doctor.id scope filter for direct Doctor-model queries:
 *   - COMPOUNDER → { id: delegatedDoctorId }
 *   - DOCTOR     → { id: ownedDoctor.id }
 *   - SUPER_ADMIN→ {} (sees all)
 *
 * Use this when querying db.doctor.* directly. For Appointment/Schedule/etc
 * queries that go through a `doctorId` foreign key, use getDoctorScope().
 */
export async function getDoctorIdScope(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (user.role === 'SUPER_ADMIN') return { filter: {} as Record<string, string> }

  if (user.role === 'COMPOUNDER') {
    return {
      filter: user.delegatedDoctorId
        ? { id: user.delegatedDoctorId }
        : { id: '__none__' },
    }
  }

  if (user.role === 'DOCTOR') {
    const ownedDoctorId = user.ownedDoctor?.id
    if (ownedDoctorId) {
      return { filter: { id: ownedDoctorId } }
    }
    const doctor = await db.doctor.findUnique({ where: { ownerAdminId: user.id } })
    return {
      filter: doctor ? { id: doctor.id } : { id: '__none__' },
    }
  }

  return { filter: { id: '__none__' } as Record<string, string> }
}

/**
 * Verify that the current user owns (or has scope over) a given doctorId.
 * Returns true if access is allowed, false otherwise.
 */
export async function canAccessDoctor(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  doctorId: string
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (user.role === 'COMPOUNDER') return user.delegatedDoctorId === doctorId
  if (user.role === 'DOCTOR') {
    const ownedId = user.ownedDoctor?.id
    if (ownedId) return ownedId === doctorId
    const doctor = await db.doctor.findUnique({ where: { ownerAdminId: user.id } })
    return doctor?.id === doctorId
  }
  return false
}

// ---------- Audit + response helpers ----------

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
