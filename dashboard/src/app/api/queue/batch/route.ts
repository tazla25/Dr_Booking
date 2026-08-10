import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const scheduleIds = url.searchParams.get('scheduleIds')?.split(',') || []
  const date = url.searchParams.get('date')

  if (!scheduleIds.length || !date) {
    return Response.json({ error: 'missing_params' }, { status: 400 })
  }

  // Group by scheduleId and status
  const groups = await db.appointment.groupBy({
    by: ['scheduleId', 'status'],
    where: { scheduleId: { in: scheduleIds }, appointmentDate: date },
    _count: { _all: true },
    _max: { queueNumber: true },
  })

  const schedules = await db.schedule.findMany({
    where: { id: { in: scheduleIds } },
    select: { id: true, avgMinutesPerPatient: true },
  })
  
  const schedMap = new Map(schedules.map((s) => [s.id, s.avgMinutesPerPatient]))

  const result: Record<string, any> = {}
  
  for (const sid of scheduleIds) {
    const sGroups = groups.filter((g) => g.scheduleId === sid)
    const completed = sGroups.find((g) => g.status === 'Completed')
    const completedCount = completed?._count._all || 0
    const currentToken = completed?._max.queueNumber || 0
    
    let pendingCount = 0
    let cancelledCount = 0
    let totalCount = 0
    
    for (const g of sGroups) {
      totalCount += g._count._all
      if (g.status === 'Cancelled' || g.status === 'NoShow') {
        cancelledCount += g._count._all
      } else if (g.status !== 'Completed') {
        pendingCount += g._count._all
      }
    }
    
    const avgMins = schedMap.get(sid) || 15
    const estimatedWaitMinutes = Number(pendingCount) * Number(avgMins)
    
    result[sid] = {
      currentToken,
      pendingCount,
      completedCount,
      estimatedWaitMinutes,
      totalCount
    }
  }

  return Response.json(result)
}
