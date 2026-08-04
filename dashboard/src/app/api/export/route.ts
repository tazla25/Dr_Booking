// /home/z/my-project/src/app/api/export/route.ts
// CSV Export API — generates CSV files for appointments, patients, and revenue.
// GET /api/export?type=appointments&from=2026-01-01&to=2026-12-31
// GET /api/export?type=patients
// GET /api/export?type=revenue&from=2026-01-01&to=2026-12-31
//
// All exports are scoped to the current user's access level.

import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDoctorScope } from '@/lib/api-helpers'
import { db } from '@/lib/db'

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(rows: Array<Record<string, string | number | null>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const headerLine = headers.join(',')
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h])).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'appointments'
  const from = url.searchParams.get('from') || '2000-01-01'
  const to = url.searchParams.get('to') || '2099-12-31'

  const { filter: scope } = await getDoctorScope(user)

  let csv = ''
  let filename = ''

  if (type === 'appointments') {
    const appointments = await db.appointment.findMany({
      where: {
        ...scope,
        appointmentDate: { gte: from, lte: to },
      },
      orderBy: { appointmentDate: 'desc' },
      select: {
        id: true,
        patientName: true,
        patientPhone: true,
        appointmentDate: true,
        queueNumber: true,
        status: true,
        notes: true,
        createdAt: true,
        doctor: { select: { fullName: true, specialization: true, fee: true } },
        schedule: { select: { clinicName: true } },
      },
      take: 5000,
    })

    const rows = appointments.map((a) => ({
      Date: a.appointmentDate,
      Queue: a.queueNumber,
      Patient: a.patientName,
      Phone: a.patientPhone,
      Doctor: a.doctor.fullName,
      Specialization: a.doctor.specialization,
      Clinic: a.schedule?.clinicName || '',
      Status: a.status,
      Fee: a.doctor.fee,
      Notes: a.notes || '',
    }))

    csv = toCsv(rows)
    filename = `appointments-${from}-to-${to}.csv`
  } else if (type === 'patients') {
    // Aggregate patient data from appointments
    const groups = await db.appointment.groupBy({
      by: ['patientPhone', 'status'],
      where: {
        ...scope,
        patientPhone: { not: '+0000000000' },
      },
      _count: { _all: true },
    })

    // Build patient map
    const patientMap = new Map<string, { phone: string; total: number; completed: number; noShow: number; cancelled: number; confirmed: number }>()
    for (const g of groups) {
      if (!patientMap.has(g.patientPhone)) {
        patientMap.set(g.patientPhone, { phone: g.patientPhone, total: 0, completed: 0, noShow: 0, cancelled: 0, confirmed: 0 })
      }
      const p = patientMap.get(g.patientPhone)!
      p.total += g._count._all
      if (g.status === 'Completed') p.completed += g._count._all
      else if (g.status === 'NoShow') p.noShow += g._count._all
      else if (g.status === 'Cancelled') p.cancelled += g._count._all
      else if (g.status === 'Confirmed') p.confirmed += g._count._all
    }

    // Get patient names from most recent appointments
    const phones = Array.from(patientMap.keys())
    const recentAppts = await db.appointment.findMany({
      where: { patientPhone: { in: phones }, ...scope },
      select: { patientName: true, patientPhone: true, doctor: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const nameMap = new Map<string, string>()
    const doctorMap = new Map<string, Set<string>>()
    for (const a of recentAppts) {
      if (!nameMap.has(a.patientPhone)) nameMap.set(a.patientPhone, a.patientName)
      if (a.doctor) {
        if (!doctorMap.has(a.patientPhone)) doctorMap.set(a.patientPhone, new Set())
        doctorMap.get(a.patientPhone)!.add(a.doctor.fullName)
      }
    }

    const rows = Array.from(patientMap.values()).map((p) => ({
      Phone: p.phone,
      Name: nameMap.get(p.phone) || 'Unknown',
      'Total Appointments': p.total,
      Completed: p.completed,
      Confirmed: p.confirmed,
      'No-show': p.noShow,
      Cancelled: p.cancelled,
      'No-show Rate': p.total > 0 ? `${((p.noShow / p.total) * 100).toFixed(1)}%` : '0%',
      'Doctors Visited': Array.from(doctorMap.get(p.phone) || []).join('; '),
    }))

    csv = toCsv(rows)
    filename = `patients-${new Date().toISOString().split('T')[0]}.csv`
  } else if (type === 'revenue') {
    // Revenue report from completed appointments
    const completed = await db.appointment.findMany({
      where: {
        ...scope,
        status: 'Completed',
        appointmentDate: { gte: from, lte: to },
      },
      orderBy: { appointmentDate: 'desc' },
      select: {
        id: true,
        appointmentDate: true,
        queueNumber: true,
        patientName: true,
        patientPhone: true,
        doctor: { select: { fullName: true, specialization: true, fee: true } },
        schedule: { select: { clinicName: true } },
      },
      take: 5000,
    })

    const rows: Array<{
      Date: string;
      Queue: number | string;
      Patient: string;
      Phone: string;
      Doctor: string;
      Specialization: string;
      Clinic: string;
      'Consultation Fee': number;
      'Payment Status': string;
    }> = completed.map((a) => ({
      Date: a.appointmentDate,
      Queue: a.queueNumber,
      Patient: a.patientName,
      Phone: a.patientPhone,
      Doctor: a.doctor.fullName,
      Specialization: a.doctor.specialization,
      Clinic: a.schedule?.clinicName || '',
      'Consultation Fee': a.doctor.fee,
      'Payment Status': 'Paid',
    }))

    // Add summary row
    const totalRevenue = completed.reduce((sum, a) => sum + (a.doctor.fee || 0), 0)
    rows.push({
      Date: 'TOTAL',
      Queue: '',
      Patient: '',
      Phone: '',
      Doctor: '',
      Specialization: '',
      Clinic: '',
      'Consultation Fee': totalRevenue,
      'Payment Status': `${completed.length} appointments`,
    })

    csv = toCsv(rows)
    filename = `revenue-${from}-to-${to}.csv`
  } else {
    return Response.json({ error: 'invalid_type', message: 'Type must be: appointments, patients, or revenue' }, { status: 400 })
  }

  // Return CSV with proper headers
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
