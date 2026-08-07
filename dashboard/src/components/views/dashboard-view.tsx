// /home/z/my-project/src/components/views/dashboard-view.tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Users, Clock, CheckCircle2, XCircle, UserX, TrendingUp, Calendar, ChevronRight, Play, Share2, Stethoscope, Plus, Globe, Zap, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { WalkInQuickAdd, type WalkInQuickAddHandle } from '../walk-in-quick-add'
import { formatInTimeZone } from 'date-fns-tz'

const IST = 'Asia/Kolkata'

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
  // BUG-011 fix: the appointments API now returns the source field. Old rows
  // (or rows from a not-yet-migrated DB) will have source === undefined and
  // we fall back to the legacy sentinel-phone check.
  source?: string
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
  // V3-008 fix: ref to the WalkInQuickAdd component so the dashboard's
  // "Add Walk-In" quick action can open its dialog directly (was navigating
  // to the appointments view, which surprised users).
  const walkInRef = useRef<WalkInQuickAddHandle>(null)
  // V3-010 fix: track the last "called" appointment per schedule so we can
  // show a mini action bar (Complete / No-Show / Skip) right after Call Next.
  const [lastCalled, setLastCalled] = useState<Record<string, Appointment | null>>({})
  const [actingApptId, setActingApptId] = useState<string | null>(null)

  const today = formatInTimeZone(new Date(), IST, 'yyyy-MM-dd')
  const todayDow = formatInTimeZone(new Date(), IST, 'EEEE')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // Scope to the user's doctor (DOCTOR sees own, COMPOUNDER sees delegated, SUPER_ADMIN sees all)
      const schedUrl = user?.doctor?.id ? `/api/schedules?doctorId=${user.doctor.id}` : '/api/schedules'
      const [apptsData, schedData] = await Promise.all([
        api<{ appointments: Appointment[]; total: number }>(
          `/api/appointments?date=${today}&limit=100`
        ),
        api<{ schedules: ScheduleWithDoctor[] }>(schedUrl),
      ])

      setAppointments(apptsData.appointments)
      const todays = schedData.schedules.filter((s) => s.dayOfWeek === todayDow)
      setSchedules(todays)

      // Fetch queue status for all of today's schedules in a single batch request
      if (todays.length > 0) {
        try {
          const scheduleIds = todays.map((s) => s.id).join(',')
          const batchQ = await api<Record<string, QueueStatus>>(`/api/queue/batch?scheduleIds=${scheduleIds}&date=${today}`)
          setQueueMap(batchQ)
        } catch {
          setQueueMap({})
        }
      } else {
        setQueueMap({})
      }
    } catch (e) {
      toast.error(t('error'))
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [today, todayDow, user, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // IMP-V4-014: keyboard shortcuts for power users. Press 'N' to call
  // next patient on the first schedule, 'R' to refresh, 'A' to open
  // walk-in dialog. Only fires when no input/textarea is focused.
  // (Defined after callNext to avoid TDZ — the effect callback runs
  // after render so the order is safe, but the dependency array
  // references must be in scope.)

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
      if (result.ok && result.appointment) {
        toast.success(t('queueUpdated'))
        // V3-010 fix: remember the called appointment so we can show a
        // mini action bar (Complete / No-Show / Skip) right under the
        // schedule card. The doctor can finalize the visit without
        // navigating to the Appointments view.
        setLastCalled((prev) => ({ ...prev, [scheduleId]: result.appointment as Appointment }))
        fetchAll()
      } else {
        toast.info(t('noAppointmentsToday'))
      }
    } catch {
      toast.error(t('error'))
    }
  }

  // V3-003 fix: action handlers for the live-queue appointment list.
  // These call the same API routes the Appointments view uses, so the
  // doctor can confirm / complete / cancel / no-show without leaving
  // the dashboard.
  const confirmAppointment = async (id: string) => {
    setActingApptId(id)
    try {
      await api(`/api/appointments/${id}/confirm`, { method: 'POST' })
      toast.success(t('appointmentConfirmed'))
      fetchAll()
    } catch (e) {
      toast.error((e as Error).message || t('error'))
    } finally {
      setActingApptId(null)
    }
  }

  const updateAppointmentStatus = async (id: string, status: 'Completed' | 'Cancelled' | 'NoShow') => {
    setActingApptId(id)
    try {
      await api(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      toast.success(
        status === 'Completed' ? t('appointmentCompleted')
        : status === 'Cancelled' ? t('appointmentCancelled')
        : t('appointmentNoShow')
      )
      // Clear the lastCalled bar for this schedule if the action targeted it
      setLastCalled((prev) => {
        const next = { ...prev }
        for (const [schedId, appt] of Object.entries(next)) {
          if (appt?.id === id) next[schedId] = null
        }
        return next
      })
      fetchAll()
    } catch (e) {
      toast.error((e as Error).message || t('error'))
    } finally {
      setActingApptId(null)
    }
  }

  // IMP-V4-014: keyboard shortcuts for power users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'r') { e.preventDefault(); fetchAll() }
      else if (key === 'a') { e.preventDefault(); walkInRef.current?.open() }
      else if (key === 'n' && schedules.length > 0) {
        e.preventDefault()
        callNext(schedules[0].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fetchAll, schedules, callNext])

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

      {/* Today's queue breakdown — online vs walk-in (Task 1.5) */}
      {/* BUG-011 fix: prefer the explicit `source` field on the appointment.
          Fall back to the sentinel-phone check for rows created before the
          migration so the count never goes negative or zero by accident. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className="gap-1.5 py-1 px-2.5">
          <Globe className="w-3 h-3 text-blue-600" />
          Online: <strong className="ml-1">{appointments.filter((a) => (a.source ? a.source === 'ONLINE' : a.patientPhone !== '+0000000000')).length}</strong>
        </Badge>
        <Badge variant="outline" className="gap-1.5 py-1 px-2.5">
          <Zap className="w-3 h-3 text-amber-600" />
          Walk-in: <strong className="ml-1">{appointments.filter((a) => (a.source ? a.source === 'WALK_IN' : a.patientPhone === '+0000000000')).length}</strong>
        </Badge>
        <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
          Total: <strong className="ml-1">{appointments.length}</strong>
        </Badge>
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
                    {/* V3-010 fix: mini action bar shown after "Call Next".
                        The doctor can finalize the visit (Complete / No-Show)
                        or skip (clear the bar) without leaving the dashboard. */}
                    {lastCalled[sch.id] && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">
                          {t('nowSeeing')}: <span className="font-medium text-foreground">#{lastCalled[sch.id]!.queueNumber} · {lastCalled[sch.id]!.patientName}</span>
                        </p>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            onClick={() => updateAppointmentStatus(lastCalled[sch.id]!.id, 'Completed')}
                            disabled={actingApptId === lastCalled[sch.id]!.id}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t('completed')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1 text-zinc-700 dark:text-zinc-400"
                            onClick={() => updateAppointmentStatus(lastCalled[sch.id]!.id, 'NoShow')}
                            disabled={actingApptId === lastCalled[sch.id]!.id}
                          >
                            <UserX className="w-3.5 h-3.5" />
                            {t('noShow')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2"
                            onClick={() => setLastCalled((prev) => ({ ...prev, [sch.id]: null }))}
                            aria-label="Dismiss"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
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
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* V3-003 fix: inline action buttons so the doctor can
                          confirm / complete / cancel / no-show directly from
                          the live queue — no need to navigate to Appointments. */}
                      {a.status === 'Pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          onClick={() => confirmAppointment(a.id)}
                          disabled={actingApptId === a.id}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span className="hidden sm:inline">{t('confirmBtn')}</span>
                        </Button>
                      )}
                      {a.status === 'Confirmed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            onClick={() => updateAppointmentStatus(a.id, 'Completed')}
                            disabled={actingApptId === a.id}
                            title={t('markCompleted')}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span className="hidden sm:inline">{t('completed')}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-zinc-600 dark:text-zinc-400"
                            onClick={() => updateAppointmentStatus(a.id, 'NoShow')}
                            disabled={actingApptId === a.id}
                            title={t('markNoShow')}
                          >
                            <UserX className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            onClick={() => updateAppointmentStatus(a.id, 'Cancelled')}
                            disabled={actingApptId === a.id}
                            title={t('cancel')}
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <StatusBadge status={a.status} lang={lang} />
                    </div>
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
            // V3-008 fix: open the walk-in dialog directly instead of
            // navigating to the Appointments view. Users clicked "Add
            // Walk-In" expecting to add a walk-in immediately — landing
            // on the full appointments list was surprising.
            onClick={() => walkInRef.current?.open()}
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
            // V3-002 fix: doctors register via the WhatsApp bot, not via a
            // dashboard "create" form. Point this quick action at the
            // Admin Verification view where super admins approve pending
            // doctor registrations. DOCTOR/COMPOUNDER users won't see this
            // tile anyway because the doctors view is admin-only.
            onClick={() => router.push('/?view=admin-verification')}
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

      {/* Floating Quick-Add for walk-in patients (Task 1.5) */}
      <WalkInQuickAdd ref={walkInRef} schedules={schedules} onAdded={fetchAll} />
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
