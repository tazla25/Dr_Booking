// /home/z/my-project/src/components/views/dashboard-view.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Users, Clock, CheckCircle2, XCircle, UserX, TrendingUp, Calendar, ChevronRight, Play, Share2, Stethoscope, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ScheduleWithDoctor {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  clinicName: string | null
  avgMinutesPerPatient: number
  doctor: { id: string; fullName: string; specialization: string } | null
}

interface Appointment {
  id: string
  patientName: string
  patientPhone: string
  queueNumber: number
  status: string
  appointmentDate: string
  doctor: { id: string; fullName: string; specialization: string }
  schedule: { id: string; clinicName: string | null; startTime: string; endTime: string }
}

interface QueueStatus {
  currentToken: number
  pendingCount: number
  estimatedWaitMinutes: number
  completedCount: number
  totalCount: number
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function DashboardView() {
  const { t, lang, user } = useApp()
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [schedules, setSchedules] = useState<ScheduleWithDoctor[]>([])
  const [queueMap, setQueueMap] = useState<Record<string, QueueStatus>>({})
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const todayDow = DAYS[new Date().getDay()]

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // Compounders only see their doctor's schedules
      const schedUrl = user?.doctorId ? `/api/schedules?doctorId=${user.doctorId}` : '/api/schedules'
      const [apptsData, schedData] = await Promise.all([
        api<{ appointments: Appointment[]; total: number }>(
          `/api/appointments?date=${today}&limit=100`
        ),
        api<{ schedules: ScheduleWithDoctor[] }>(schedUrl),
      ])

      setAppointments(apptsData.appointments)
      const todays = schedData.schedules.filter((s) => s.dayOfWeek === todayDow)
      setSchedules(todays)

      // Fetch queue status for each of today's schedules
      const queueEntries = await Promise.all(
        todays.map(async (s) => {
          try {
            const q = await api<QueueStatus>(`/api/queue/${s.id}/${today}`)
            return [s.id, q] as const
          } catch {
            return [s.id, { currentToken: 0, pendingCount: 0, estimatedWaitMinutes: 0, completedCount: 0, totalCount: 0 }] as const
          }
        })
      )
      setQueueMap(Object.fromEntries(queueEntries))
    } catch (e) {
      toast.error(t('error'))
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [today, todayDow, user?.doctorId, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const pending = appointments.filter((a) => a.status === 'Confirmed' || a.status === 'Pending')
  const completed = appointments.filter((a) => a.status === 'Completed')
  const cancelled = appointments.filter((a) => a.status === 'Cancelled')
  const noShow = appointments.filter((a) => a.status === 'NoShow')
  const noShowRate = appointments.length > 0 ? (noShow.length / appointments.length) * 100 : 0

  const callNext = async (scheduleId: string) => {
    try {
      const result = await api<{ ok: boolean; appointment?: Appointment; message?: string }>(
        '/api/queue/next',
        {
          method: 'POST',
          body: JSON.stringify({ scheduleId, date: today }),
        }
      )
      if (result.ok) {
        toast.success(t('queueUpdated'))
        fetchAll()
      } else {
        toast.info(t('noAppointmentsToday'))
      }
    } catch {
      toast.error(t('error'))
    }
  }

  const shareTracker = (scheduleId: string) => {
    const url = `${window.location.origin}/?view=tracker&scheduleId=${scheduleId}&date=${today}`
    navigator.clipboard.writeText(url)
    toast.success(t('trackerLinkCopied'))
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('todaysQueue')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('managePatients')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-2 self-start">
          <Clock className="w-4 h-4" />
          {t('refresh')}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label={t('totalPatients')}
          value={appointments.length}
          color="primary"
          loading={loading}
        />
        <KpiCard
          icon={Clock}
          label={t('waiting')}
          value={pending.length}
          color="amber"
          loading={loading}
        />
        <KpiCard
          icon={CheckCircle2}
          label={t('completed')}
          value={completed.length}
          color="emerald"
          loading={loading}
        />
        <KpiCard
          icon={UserX}
          label={t('noShowRate')}
          value={`${noShowRate.toFixed(0)}%`}
          color="rose"
          loading={loading}
          sub={`${noShow.length} ${t('noShow').toLowerCase()} · ${cancelled.length} ${t('cancelled').toLowerCase()}`}
        />
      </div>

      {/* Today's schedules / queues */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          {t('todaysQueue')} — {todayDow}
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : schedules.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">{t('noAppointmentsTodayDesc')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((sch) => {
              const q = queueMap[sch.id] || { currentToken: 0, pendingCount: 0, estimatedWaitMinutes: 0, completedCount: 0, totalCount: 0 }
              return (
                <Card key={sch.id} className="overflow-hidden">
                  <CardHeader className="pb-3 bg-gradient-to-br from-accent/30 to-transparent">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {sch.doctor?.fullName}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {sch.doctor?.specialization} · {sch.clinicName || 'Clinic'}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {sch.startTime}–{sch.endTime}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-2xl font-bold text-primary">{q.currentToken}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('currentToken')}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{q.pendingCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('waiting')}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-emerald-600">{q.completedCount}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('completed')}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        ~{q.estimatedWaitMinutes} {t('minutes')}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {sch.avgMinutesPerPatient} {t('minutes')}/{t('patient').toLowerCase()}
                      </span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => callNext(sch.id)}
                        disabled={q.pendingCount === 0}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {t('callNext')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => shareTracker(sch.id)}
                        aria-label={t('shareTracker')}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/?view=tracker&scheduleId=${sch.id}&date=${today}`)}
                      >
                        {t('viewTracker')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent appointments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {t('recentAppointments')}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => router.push('/?view=appointments')} className="gap-1">
            {t('viewAll')}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : appointments.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">{t('noAppointmentsTodayDesc')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {appointments.slice(0, 8).map((a) => (
                  <li key={a.id} className="px-4 sm:px-6 py-3 hover:bg-accent/30 transition-colors flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-sm">
                        #{a.queueNumber}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{a.patientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.doctor.fullName} · {a.patientPhone}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={a.status} lang={lang} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">{t('quickActions')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            variant="outline"
            className="h-auto py-5 justify-start gap-3"
            onClick={() => router.push('/?view=appointments')}
          >
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold">{t('addWalkIn')}</p>
              <p className="text-xs text-muted-foreground">{t('patientList')}</p>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-5 justify-start gap-3"
            onClick={() => router.push('/?view=doctors')}
          >
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold">{t('addDoctor')}</p>
              <p className="text-xs text-muted-foreground">{t('doctorManagement')}</p>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-5 justify-start gap-3"
            onClick={() => router.push('/?view=analytics')}
          >
            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold">{t('analytics')}</p>
              <p className="text-xs text-muted-foreground">{t('analyticsOverview')}</p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  loading,
  sub,
}: {
  icon: typeof Users
  label: string
  value: number | string
  color: 'primary' | 'amber' | 'emerald' | 'rose'
  loading: boolean
  sub?: string
}) {
  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  }
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <p className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{value}</p>
          )}
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/70 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status, lang }: { status: string; lang: 'bn' | 'en' }) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; cls: string }> = {
    Pending: { variant: 'secondary', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
    Confirmed: { variant: 'secondary', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
    Completed: { variant: 'secondary', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
    Cancelled: { variant: 'secondary', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
    NoShow: { variant: 'secondary', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
  }
  const cfg = map[status] || map.Confirmed
  const labels: Record<string, { bn: string; en: string }> = {
    Pending: { bn: 'অপেক্ষমাণ', en: 'Pending' },
    Confirmed: { bn: 'নিশ্চিত', en: 'Confirmed' },
    Completed: { bn: 'সম্পন্ন', en: 'Completed' },
    Cancelled: { bn: 'বাতিল', en: 'Cancelled' },
    NoShow: { bn: 'অনুপস্থিত', en: 'No-show' },
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>
      {labels[status]?.[lang] || status}
    </span>
  )
}
