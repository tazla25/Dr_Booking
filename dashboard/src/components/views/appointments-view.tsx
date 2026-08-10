// /home/z/my-project/src/components/views/appointments-view.tsx
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
// @ts-ignore
import { useQuery, useAction } from 'wasp/client/operations'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { formatInTimeZone } from 'date-fns-tz'

const IST = 'Asia/Kolkata'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Search, CheckCircle2, XCircle, UserX, CalendarClock, Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

interface Doctor {
  id: string
  fullName: string
  specialization: string
}

interface Appointment {
  id: string
  patientName: string
  patientPhone: string
  queueNumber: number
  status: string
  appointmentDate: string
  notes: string | null
  doctor: { id: string; fullName: string; specialization: string }
  schedule: { id: string; clinicName: string | null; startTime: string; endTime: string }
}

interface Schedule {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  clinicName: string | null
  doctor: { id: string; fullName: string }
}

import { phoneSchema } from '@/lib/validators'

const walkInSchema = z.object({
  scheduleId: z.string().min(1),
  patientName: z.string().trim().min(2).max(100),
  patientPhone: phoneSchema.or(z.literal('')),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
})

export function AppointmentsView() {
  const { t, lang, user } = useApp()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageSize = 50

  // Filters
  const [q, setQ] = useState('')
  const [doctorFilter, setDoctorFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  // IMP-V4-007: client-side sort options
  const [sortBy, setSortBy] = useState<string>('date_desc')

  // Actions
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [noShowId, setNoShowId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Walk-in dialog
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkIn, setWalkIn] = useState({
    scheduleId: '',
    patientName: '',
    patientPhone: '',
    appointmentDate: formatInTimeZone(new Date(), IST, 'yyyy-MM-dd'),
    notes: '',
  })
  const [savingWalkIn, setSavingWalkIn] = useState(false)

  const fetchDoctors = useCallback(async () => {
    try {
      const data = await api<{ doctors: Doctor[] }>('/api/doctors')
      setDoctors(data.doctors)
    } catch {
      // ignore
    }
  }, [])

  const fetchSchedules = useCallback(async () => {
    try {
      const data = await api<{ schedules: Schedule[] }>(
        user?.doctor?.id ? `/api/schedules?doctorId=${user.doctor.id}` : '/api/schedules'
      )
      setSchedules(data.schedules)
    } catch {
      // ignore
    }
  }, [user])

  const fetchAppointments = useCallback(async (currentCursor: string | null = null, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      if (currentCursor) params.set('cursor', currentCursor)
      
      if (q) params.set('q', q)
      if (doctorFilter !== 'all') params.set('doctorId', doctorFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (dateFilter === 'today') {
        params.set('date', formatInTimeZone(new Date(), IST, 'yyyy-MM-dd'))
      } else if (dateFilter !== 'all') {
        params.set('date', dateFilter)
      }

      const data = await api<{ appointments: Appointment[]; total: number; nextCursor: string | null }>(
        `/api/appointments?${params.toString()}`
      )
      
      if (append) {
        setAppointments(prev => [...prev, ...data.appointments])
      } else {
        setAppointments(data.appointments)
      }
      setTotal(data.total)
      setCursor(data.nextCursor)
      setHasMore(data.appointments.length === pageSize && !!data.nextCursor)
    } catch (e) {
      toast.error(t('error'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [q, doctorFilter, statusFilter, dateFilter, pageSize, t])

  useEffect(() => {
    fetchDoctors()
    fetchSchedules()
  }, [fetchDoctors, fetchSchedules])

  useEffect(() => {
    const handler = setTimeout(() => fetchAppointments(null, false), 200)
    return () => clearTimeout(handler)
  }, [fetchAppointments])

  // IMP-V4-007: client-side sort. The API returns results ordered by
  // createdAt desc — we re-sort the current page client-side so the user
  // can switch between queue #, name, and date ordering instantly.
  const sortedAppointments = useMemo(() => {
    const sorted = [...appointments]
    switch (sortBy) {
      case 'date_asc':
        return sorted.sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate) || a.queueNumber - b.queueNumber)
      case 'date_desc':
        return sorted.sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate) || b.queueNumber - a.queueNumber)
      case 'queue_asc':
        return sorted.sort((a, b) => a.queueNumber - b.queueNumber)
      case 'queue_desc':
        return sorted.sort((a, b) => b.queueNumber - a.queueNumber)
      case 'name_asc':
        return sorted.sort((a, b) => a.patientName.localeCompare(b.patientName))
      case 'name_desc':
        return sorted.sort((a, b) => b.patientName.localeCompare(a.patientName))
      default:
        return sorted
    }
  }, [appointments, sortBy])

  const updateStatus = async (id: string, status: string) => {
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
      fetchAppointments()
    } catch {
      toast.error(t('error'))
    }
  }

  // Confirm a Pending appointment: sets status='Confirmed' AND sends the
  // patient their token number + live tracking link via WhatsApp. This is
  // the second half of the two-step booking flow — the patient booked via
  // the bot (got BOOKING_RECEIVED, no token), and now the doctor confirms
  // availability which triggers the tracker message.
  const confirmAppointment = async (id: string) => {
    setConfirming(true)
    try {
      await api(`/api/appointments/${id}/confirm`, { method: 'POST' })
      toast.success(t('appointmentConfirmed'))
      setConfirmId(null)
      fetchAppointments()
    } catch {
      toast.error(t('error'))
    } finally {
      setConfirming(false)
    }
  }

  const doReschedule = async () => {
    if (!rescheduleId || !rescheduleDate) return
    try {
      await api(`/api/appointments/${rescheduleId}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ newDate: rescheduleDate, appointmentId: rescheduleId }),
      })
      toast.success(t('appointmentRescheduled'))
      setRescheduleId(null)
      setRescheduleDate('')
      fetchAppointments()
    } catch {
      toast.error(t('error'))
    }
  }

  const submitWalkIn = async () => {
    setSavingWalkIn(true)
    try {
      const parsed = walkInSchema.parse(walkIn)
      await api('/api/appointments/walk-in', {
        method: 'POST',
        body: JSON.stringify(parsed),
      })
      toast.success(t('walkInAdded'))
      setWalkInOpen(false)
      setWalkIn({
        scheduleId: '',
        patientName: '',
        patientPhone: '',
        appointmentDate: formatInTimeZone(new Date(), IST, 'yyyy-MM-dd'),
        notes: '',
      })
      fetchAppointments()
    } catch (e) {
      const err = e as Error
      toast.error(err.message || t('error'))
    } finally {
      setSavingWalkIn(false)
    }
  }

  const statusLabel = (s: string) => {
    const map: Record<string, { bn: string; en: string }> = {
      Pending: { bn: 'অপেক্ষমাণ', en: 'Pending' },
      Confirmed: { bn: 'নিশ্চিত', en: 'Confirmed' },
      Completed: { bn: 'সম্পন্ন', en: 'Completed' },
      Cancelled: { bn: 'বাতিল', en: 'Cancelled' },
      NoShow: { bn: 'অনুপস্থিত', en: 'No-show' },
    }
    return map[s]?.[lang] || s
  }

  const statusClass = (s: string) => {
    const map: Record<string, string> = {
      Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
      Confirmed: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
      Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
      Cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
      NoShow: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
    }
    return map[s] || map.Confirmed
  }

  const filteredSchedules = useMemo(() => {
    return schedules
  }, [schedules])

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('allAppointments')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? t('loadingAppointments') : `${t('showing')} ${appointments.length} ${t('of')} ${total} ${t('total')}`}
          </p>
        </div>
        <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 self-start">
              <Plus className="w-4 h-4" />
              {t('addWalkIn')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('addWalkIn')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t('selectDoctor')} / {t('schedules')}</Label>
                <Select
                  value={walkIn.scheduleId}
                  onValueChange={(v) => setWalkIn({ ...walkIn, scheduleId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectSchedule')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSchedules.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.doctor.fullName} · {s.dayOfWeek} {s.startTime} · {s.clinicName || 'Clinic'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('patient')} {t('fullName')}</Label>
                  <Input
                    value={walkIn.patientName}
                    onChange={(e) => setWalkIn({ ...walkIn, patientName: e.target.value })}
                    placeholder="Arijit Ghosh"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('phone')}</Label>
                  <Input
                    value={walkIn.patientPhone}
                    onChange={(e) => {
                      let val = e.target.value
                      if (/^[6-9]\d{9}$/.test(val)) val = '+91' + val
                      setWalkIn({ ...walkIn, patientPhone: val })
                    }}
                    placeholder="+8801712345678"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('date')}</Label>
                <Input
                  type="date"
                  value={walkIn.appointmentDate}
                  onChange={(e) => setWalkIn({ ...walkIn, appointmentDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={walkIn.notes}
                  onChange={(e) => setWalkIn({ ...walkIn, notes: e.target.value })}
                  placeholder="Follow-up visit (optional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWalkInOpen(false)}>
                {t('cancelBtn')}
              </Button>
              <Button onClick={submitWalkIn} disabled={savingWalkIn}>
                {savingWalkIn ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>{t('filterByDoctor')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchByNamePhone')}
                value={q}
                onChange={(e) => { setQ(e.target.value) }}
                className="pl-10"
              />
            </div>
            <Select value={doctorFilter} onValueChange={(v) => { setDoctorFilter(v) }}>
              <SelectTrigger>
                <SelectValue placeholder={t('allDoctors')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allDoctors')}</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fullName} · {d.specialization}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v) }}>
              <SelectTrigger>
                <SelectValue placeholder={t('allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStatuses')}</SelectItem>
                <SelectItem value="Pending">{t('statusPending')}</SelectItem>
                <SelectItem value="Confirmed">{t('statusConfirmed')}</SelectItem>
                <SelectItem value="Completed">{t('statusCompleted')}</SelectItem>
                <SelectItem value="Cancelled">{t('statusCancelled')}</SelectItem>
                <SelectItem value="NoShow">{t('statusNoShow')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter === 'all' || dateFilter === 'today' ? dateFilter : 'custom'} onValueChange={(v) => {
              if (v === 'custom') {
                // Keep whatever custom date is already set (or default to today)
                setDateFilter((prev) => (prev === 'all' || prev === 'today') ? formatInTimeZone(new Date(), IST, 'yyyy-MM-dd') : prev)
              } else {
                setDateFilter(v)
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder={t('allDates')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allDates')}</SelectItem>
                <SelectItem value="today">{t('today')}</SelectItem>
                {/* BUG-014 fix: custom date picker as a third filter option.
                    Selecting it reveals the date input below. */}
                <SelectItem value="custom">Custom date…</SelectItem>
              </SelectContent>
            </Select>
            {/* Custom date input — only visible when "Custom date…" is selected. */}
            {dateFilter !== 'all' && dateFilter !== 'today' && (
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value || 'all')}
                aria-label="Custom appointment date"
              />
            )}
            {/* IMP-V4-007: sort dropdown */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_desc">Newest first</SelectItem>
                <SelectItem value="date_asc">Oldest first</SelectItem>
                <SelectItem value="queue_asc">Queue # (low → high)</SelectItem>
                <SelectItem value="queue_desc">Queue # (high → low)</SelectItem>
                <SelectItem value="name_asc">Name (A → Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z → A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : sortedAppointments.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarClock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="text-lg font-semibold mb-1">{t('noResults')}</h3>
              <p className="text-muted-foreground text-sm">{t('noResultsDesc')}</p>
            </div>
          ) : (
            <>
              {/* IMP-004 fix: mobile card-based layout (below md breakpoint).
                  The horizontal-scrolling table is hard to use on small
                  screens, so we render a vertical card list instead. Each
                  card surfaces the same status + actions as the table row. */}
              <div className="md:hidden divide-y divide-border">
                {sortedAppointments.map((a) => (
                  <div key={a.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-xs flex-shrink-0">
                          #{a.queueNumber}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{a.patientName}</p>
                          {a.notes && (
                            <p className="text-xs text-muted-foreground truncate">{a.notes}</p>
                          )}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusClass(a.status)}`}>
                        {statusLabel(a.status)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                      <span className="truncate">📞 {a.patientPhone}</span>
                      <span className="truncate">📅 {new Date(a.appointmentDate).toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-US', { day: '2-digit', month: 'short' })}</span>
                      <span className="truncate col-span-2">🩺 {a.doctor.fullName} · {a.doctor.specialization}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {a.status === 'Pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-3 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold"
                            onClick={() => setConfirmId(a.id)}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            {t('confirmBtn')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            onClick={() => setCancelId(a.id)}
                            title={t('cancel')}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {a.status === 'Confirmed' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            onClick={() => updateStatus(a.id, 'Completed')}
                            title={t('markCompleted')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-zinc-600 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            onClick={() => setNoShowId(a.id)}
                            title={t('markNoShow')}
                          >
                            <UserX className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            onClick={() => setCancelId(a.id)}
                            title={t('cancel')}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                            onClick={() => {
                              setRescheduleId(a.id)
                              setRescheduleDate(a.appointmentDate)
                            }}
                            title={t('reschedule')}
                          >
                            <CalendarClock className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Table — hidden on mobile (use the card layout above), shown on md+ */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium">{t('queue')}</th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium">{t('patient')}</th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium hidden md:table-cell">{t('phone')}</th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium hidden lg:table-cell">{t('doctor')}</th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium">{t('date')}</th>
                    <th className="px-3 sm:px-4 py-3 text-left font-medium">{t('status')}</th>
                    <th className="px-3 sm:px-4 py-3 text-right font-medium">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedAppointments.map((a) => (
                    <tr key={a.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-3 sm:px-4 py-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-xs">
                          #{a.queueNumber}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <p className="font-medium text-foreground">{a.patientName}</p>
                        {a.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">{a.notes}</p>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {a.patientPhone}
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                        <p className="text-foreground">{a.doctor.fullName}</p>
                        <p className="text-xs text-muted-foreground">{a.doctor.specialization}</p>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(a.appointmentDate).toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-US', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(a.status)}`}>
                          {statusLabel(a.status)}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {a.status === 'Pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-3 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold"
                                onClick={() => setConfirmId(a.id)}
                                title={t('confirmAppointment')}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                {t('confirmBtn')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                onClick={() => setCancelId(a.id)}
                                title={t('cancel')}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {a.status === 'Confirmed' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                onClick={() => updateStatus(a.id, 'Completed')}
                                title={t('markCompleted')}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-zinc-600 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                onClick={() => setNoShowId(a.id)}
                                title={t('markNoShow')}
                              >
                                <UserX className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                onClick={() => setCancelId(a.id)}
                                title={t('cancel')}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                                onClick={() => {
                                  setRescheduleId(a.id)
                                  setRescheduleDate(a.appointmentDate)
                                }}
                                title={t('reschedule')}
                              >
                                <CalendarClock className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            onClick={() => fetchAppointments(cursor, true)}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancel')}?</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmCancel')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelId) updateStatus(cancelId, 'Cancelled')
                setCancelId(null)
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {t('confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Pending appointment — sends token + tracker to patient */}
      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmAppointment')}?</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmAppointmentDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (confirmId) confirmAppointment(confirmId)
              }}
              disabled={confirming}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {confirming ? t('loading') : t('confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No-show confirmation */}
      <AlertDialog open={!!noShowId} onOpenChange={(o) => !o && setNoShowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('markNoShow')}?</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmNoShow')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (noShowId) updateStatus(noShowId, 'NoShow')
                setNoShowId(null)
              }}
            >
              {t('confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule dialog */}
      <Dialog open={!!rescheduleId} onOpenChange={(o) => !o && setRescheduleId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('reschedule')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>{t('rescheduleTo')}</Label>
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleId(null)}>
              {t('cancelBtn')}
            </Button>
            <Button onClick={doReschedule} disabled={!rescheduleDate}>
              {t('confirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
