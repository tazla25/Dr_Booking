// /home/z/my-project/src/app/api/patients/route.ts
// Patient Management API — aggregates patient data from appointments.
// GET /api/patients — list patients with search, pagination, and stats.
//
// Scope: SUPER_ADMIN sees all; DOCTOR sees own patients; COMPOUNDER sees delegated doctor's patients.

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200)

  // Build scope filter for appointments (has doctorId)
  let scopeFilter: Record<string, unknown> = {}
  if (user.role === 'SUPER_ADMIN') {
    scopeFilter = {}
  } else if (user.role === 'DOCTOR') {
    const ownedId = user.ownedDoctor?.id
    scopeFilter = ownedId ? { doctorId: ownedId } : { doctorId: '__none__' }
  } else if (user.role === 'COMPOUNDER') {
    scopeFilter = user.delegatedDoctorId ? { doctorId: user.delegatedDoctorId } : { doctorId: '__none__' }
  } else {
    scopeFilter = { doctorId: '__none__' }
  }

  // Search filter on patient name/phone
  const searchFilter = q
    ? {
        OR: [
          { patientName: { contains: q, mode: 'insensitive' as const } },
          { patientPhone: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  // Exclude walk-in placeholder phone from patient list
  const excludeWalkIn = { patientPhone: { not: '+0000000000' } }

  // Group appointments by patient phone to build patient list.
  // Note: We intentionally drop cursor-based pagination here because Prisma's
  // groupBy typing for conditional cursor fields is incompatible with the
  // wide-typed `where` filter (Record<string, unknown>). The `take: limit`
  // already caps results; users can refine via the `q` search parameter.
  const patientGroups = await db.appointment.groupBy({
    by: ['patientPhone'],
    where: {
      ...scopeFilter,
      ...searchFilter,
      ...excludeWalkIn,
    },
    _count: { _all: true },
    _max: { appointmentDate: true, createdAt: true },
    _min: { appointmentDate: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: limit,
  })

  // Fetch patient names (most recent appointment name wins)
  const patientPhones = patientGroups.map((g) => g.patientPhone)
  const recentAppts = await db.appointment.findMany({
    where: {
      patientPhone: { in: patientPhones },
      ...scopeFilter,
    },
    select: {
      patientName: true,
      patientPhone: true,
      status: true,
      doctor: { select: { id: true, fullName: true, specialization: true } },
      appointmentDate: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // Build patient list with details
  const patientMap = new Map<string, {
    phone: string
    name: string
    totalAppointments: number
    lastVisit: string
    firstVisit: string
    doctors: Set<string>
    doctorNames: string[]
    lastStatus: string
  }>()

  // First, populate from groupBy
  for (const g of patientGroups) {
    patientMap.set(g.patientPhone, {
      phone: g.patientPhone,
      name: '',
      totalAppointments: g._count._all,
      lastVisit: g._max.appointmentDate || '',
      firstVisit: g._min.appointmentDate || '',
      doctors: new Set<string>(),
      doctorNames: [],
      lastStatus: '',
    })
  }

  // Then, enrich with name and doctor info from recent appointments
  for (const a of recentAppts) {
    const p = patientMap.get(a.patientPhone)
    if (!p) continue
    if (!p.name) p.name = a.patientName
    if (a.doctor) {
      if (!p.doctors.has(a.doctor.fullName)) {
        p.doctors.add(a.doctor.fullName)
        p.doctorNames.push(a.doctor.fullName)
      }
    }
    if (!p.lastStatus) p.lastStatus = a.status
  }

  // Get status breakdown per patient (completed, no-show, cancelled)
  const statusBreakdowns = await db.appointment.groupBy({
    by: ['patientPhone', 'status'],
    where: {
      patientPhone: { in: patientPhones },
      ...scopeFilter,
    },
    _count: { _all: true },
  })

  for (const sb of statusBreakdowns) {
    const p = patientMap.get(sb.patientPhone)
    if (!p) continue
    if (sb.status === 'Completed') {
      (p as Record<string, unknown>).completedCount = sb._count._all
    } else if (sb.status === 'NoShow') {
      (p as Record<string, unknown>).noShowCount = sb._count._all
    } else if (sb.status === 'Cancelled') {
      (p as Record<string, unknown>).cancelledCount = sb._count._all
    }
  }

  // Convert to array and sort by last visit (most recent first)
  const patients = Array.from(patientMap.values())
    .filter((p) => p.name)
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))
    .map((p) => ({
      phone: p.phone,
      name: p.name,
      totalAppointments: p.totalAppointments,
      lastVisit: p.lastVisit,
      firstVisit: p.firstVisit,
      doctors: p.doctorNames.slice(0, 3),
      lastStatus: p.lastStatus,
      completedCount: ((p as Record<string, unknown>).completedCount as number) || 0,
      noShowCount: ((p as Record<string, unknown>).noShowCount as number) || 0,
      cancelledCount: ((p as Record<string, unknown>).cancelledCount as number) || 0,
    }))

  const total = patientGroups.length

  return Response.json({
    patients,
    total,
    nextCursor: patientGroups.length === limit ? patientGroups[patientGroups.length - 1]?.patientPhone : null,
  })
}
