// /home/z/my-project/src/components/views/schedules-view.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
// @ts-ignore
import { useQuery, useAction } from 'wasp/client/operations'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Plus, Clock, Pencil, Trash2, MapPin, Stethoscope, Share2, ExternalLink, CalendarX, CalendarClock, X } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Badge } from '../ui/badge'
import { Textarea } from '../ui/textarea'

interface Doctor {
  id: string
  fullName: string
  specialization: string
}

interface Schedule {
  id: string
  doctorId: string
  pinCode: number
  dayOfWeek: string
  startTime: string
  endTime: string
  clinicName: string | null
  clinicAddress: string | null
  avgMinutesPerPatient: number
  doctor: { id: string; fullName: string; specialization: string } | null
  _count?: { appointments: number }
}

interface ScheduleOverride {
  id: string
  scheduleId: string
  date: string
  type: 'CLOSED' | 'MODIFIED_HOURS' | 'SPECIAL'
  newStartTime: string | null
  newEndTime: string | null
  reason: string | null
  createdAt: string
}

interface OverrideDialogState {
  open: boolean
  scheduleId: string | null
  scheduleLabel: string | null
  date: string
  type: 'CLOSED' | 'MODIFIED_HOURS' | 'SPECIAL'
  newStartTime: string
  newEndTime: string
  reason: string
  saving: boolean
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const scheduleSchema = z.object({
  doctorId: z.string().min(1),
  pinCode: z.coerce.number().int().min(100000).max(999999),
  dayOfWeek: z.enum(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  clinicName: z.string().trim().max(120).optional().or(z.literal('')),
  clinicAddress: z.string().trim().max(300).optional().or(z.literal('')),
  avgMinutesPerPatient: z.coerce.number().int().min(1).max(180),
})

type ScheduleForm = z.infer<typeof scheduleSchema>

const emptyForm: ScheduleForm = {
  doctorId: '',
  pinCode: 700001,
  dayOfWeek: 'Monday',
  startTime: '10:00',
  endTime: '14:00',
  clinicName: '',
  clinicAddress: '',
  avgMinutesPerPatient: 10,
}

export function SchedulesView() {
  const { t, lang, user } = useApp()
  const router = useRouter()
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'DOCTOR'

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [form, setForm] = useState<ScheduleForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Override state
  const [overridesBySchedule, setOverridesBySchedule] = useState<Record<string, ScheduleOverride[]>>({})
  const [overrideDialog, setOverrideDialog] = useState<OverrideDialogState>({
    open: false,
    scheduleId: null,
    scheduleLabel: null,
    date: new Date().toISOString().split('T')[0],
    type: 'CLOSED',
    newStartTime: '10:00',
    newEndTime: '14:00',
    reason: '',
    saving: false,
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [schedData, docData] = await Promise.all([
        api<{ schedules: Schedule[] }>(
          user?.doctor?.id ? `/api/schedules?doctorId=${user.doctor.id}` : '/api/schedules'
        ),
        api<{ doctors: Doctor[] }>('/api/doctors'),
      ])
      setSchedules(schedData.schedules)
      setDoctors(docData.doctors)

      // Fetch overrides for each schedule (in parallel)
      const overrideEntries = await Promise.all(
        schedData.schedules.map(async (s) => {
          try {
            const data = await api<{ overrides: ScheduleOverride[] }>(`/api/schedules/${s.id}/overrides`)
            return [s.id, data.overrides] as const
          } catch {
            return [s.id, []] as const
          }
        })
      )
      setOverridesBySchedule(Object.fromEntries(overrideEntries))
    } catch {
      toast.error(t('error'))
    } finally {
      setLoading(false)
    }
  }, [user, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, doctorId: doctors[0]?.id || '' })
    setOpen(true)
  }

  const openEdit = (s: Schedule) => {
    setEditing(s)
    setForm({
      doctorId: s.doctorId,
      pinCode: s.pinCode,
      dayOfWeek: s.dayOfWeek as ScheduleForm['dayOfWeek'],
      startTime: s.startTime,
      endTime: s.endTime,
      clinicName: s.clinicName || '',
      clinicAddress: s.clinicAddress || '',
      avgMinutesPerPatient: s.avgMinutesPerPatient,
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const parsed = scheduleSchema.parse(form)
      if (parsed.endTime <= parsed.startTime) {
        throw new Error(t('endTimeAfterStart'))
      }
      if (editing) {
        await api(`/api/schedules/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(parsed),
        })
        toast.success(t('updated'))
      } else {
        await api('/api/schedules', {
          method: 'POST',
          body: JSON.stringify(parsed),
        })
        toast.success(t('saved'))
      }
      setOpen(false)
      fetchAll()
    } catch (e) {
      const err = e as Error
      toast.error(err.message || t('error'))
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!deleteId) return
    try {
      await api(`/api/schedules/${deleteId}`, { method: 'DELETE' })
      toast.success(t('deleted'))
      setDeleteId(null)
      fetchAll()
    } catch {
      toast.error(t('error'))
    }
  }

  const shareTracker = (scheduleId: string) => {
    const url = `${window.location.origin}/?view=tracker&scheduleId=${scheduleId}&date=${new Date().toISOString().split('T')[0]}`
    navigator.clipboard.writeText(url)
    toast.success(t('trackerLinkCopied'))
  }

  // ── Override handlers (Task 1.4) ───────────────────────────────────
  const openOverrideDialog = (schedule: Schedule, defaultDate?: string) => {
    setOverrideDialog({
      open: true,
      scheduleId: schedule.id,
      scheduleLabel: `${schedule.doctor?.fullName || ''} · ${schedule.dayOfWeek} ${schedule.startTime}–${schedule.endTime}`,
      date: defaultDate || new Date().toISOString().split('T')[0],
      type: 'CLOSED',
      newStartTime: schedule.startTime,
      newEndTime: schedule.endTime,
      reason: '',
      saving: false,
    })
  }

  const saveOverride = async () => {
    if (!overrideDialog.scheduleId) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideDialog.date)) {
      toast.error('Date must be YYYY-MM-DD')
      return
    }
    if (overrideDialog.type === 'MODIFIED_HOURS' && (!overrideDialog.newStartTime || !overrideDialog.newEndTime)) {
      toast.error('Modified hours requires new start/end times')
      return
    }
    setOverrideDialog((prev) => ({ ...prev, saving: true }))
    try {
      const body: Record<string, unknown> = {
        date: overrideDialog.date,
        type: overrideDialog.type,
        reason: overrideDialog.reason || null,
      }
      if (overrideDialog.type === 'MODIFIED_HOURS') {
        body.newStartTime = overrideDialog.newStartTime
        body.newEndTime = overrideDialog.newEndTime
      }
      const data = await api<{ override: ScheduleOverride; affectedAppointments: { id: string; patientName: string }[] }>(
        `/api/schedules/${overrideDialog.scheduleId}/overrides`,
        { method: 'POST', body: JSON.stringify(body) }
      )
      if (data.affectedAppointments && data.affectedAppointments.length > 0) {
        toast.success(`Override saved. ${data.affectedAppointments.length} patient(s) will be notified by the bot.`)
      } else {
        toast.success('Override saved')
      }
      setOverrideDialog((prev) => ({ ...prev, open: false }))
      fetchAll()
    } catch (e) {
      toast.error((e as Error).message || t('error'))
    } finally {
      setOverrideDialog((prev) => ({ ...prev, saving: false }))
    }
  }

  const removeOverride = async (scheduleId: string, date: string) => {
    try {
      await api(`/api/schedules/${scheduleId}/overrides/${date}`, { method: 'DELETE' })
      toast.success('Override removed')
      fetchAll()
    } catch (e) {
      toast.error((e as Error).message || t('error'))
    }
  }

  const isTodayClosed = (scheduleId: string): ScheduleOverride | null => {
    const today = new Date().toISOString().split('T')[0]
    const list = overridesBySchedule[scheduleId] || []
    return list.find((o) => o.date === today && o.type === 'CLOSED') || null
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('scheduleManagement')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {schedules.length} {t('schedules').toLowerCase()}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2 self-start">
            <Plus className="w-4 h-4" />
            {t('addNewSchedule')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold mb-1">{t('noSchedules')}</h3>
            <p className="text-muted-foreground text-sm">{t('noSchedulesDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedules.map((s) => (
            <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{s.doctor?.fullName}</h3>
                      <p className="text-xs text-muted-foreground">{s.doctor?.specialization}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/15 text-primary uppercase tracking-wider">
                    PIN {s.pinCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm border-t border-border pt-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('dayOfWeek')}</p>
                    <p className="font-medium">{s.dayOfWeek}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('startTime')}–{t('endTime')}</p>
                    <p className="font-medium">{s.startTime} – {s.endTime}</p>
                  </div>
                </div>

                {s.clinicName && (
                  <div className="text-sm">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('clinicName')}</p>
                    <p className="font-medium">{s.clinicName}</p>
                    {s.clinicAddress && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {s.clinicAddress}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                  <span>~{s.avgMinutesPerPatient} {t('minutes')}/{t('patient').toLowerCase()}</span>
                  <span>{s._count?.appointments || 0} {t('totalAppts').toLowerCase()}</span>
                </div>

                {/* Today's status indicator (Task 1.4) */}
                {isTodayClosed(s.id) ? (
                  <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md p-2 flex items-center gap-2 text-xs">
                    <CalendarX className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span className="text-rose-700 dark:text-rose-400 font-medium">
                      Closed today{isTodayClosed(s.id)?.reason ? `: ${isTodayClosed(s.id)?.reason}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-6 px-2 text-xs"
                      onClick={() => removeOverride(s.id, isTodayClosed(s.id)!.date)}
                    >
                      Reopen
                    </Button>
                  </div>
                ) : (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-md p-2 flex items-center gap-2 text-xs">
                    <CalendarClock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Open today</span>
                  </div>
                )}

                {/* Existing overrides list */}
                {(overridesBySchedule[s.id] || []).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Upcoming overrides</p>
                    {(overridesBySchedule[s.id] || []).slice(0, 5).map((o) => (
                      <div key={o.id} className="flex items-center gap-2 text-xs bg-muted/40 rounded p-1.5">
                        <Badge
                          variant="secondary"
                          className={
                            o.type === 'CLOSED'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
                              : o.type === 'MODIFIED_HOURS'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400'
                          }
                        >
                          {o.type === 'CLOSED' ? 'CLOSED' : o.type === 'MODIFIED_HOURS' ? 'MODIFIED' : 'SPECIAL'}
                        </Badge>
                        <span className="font-mono">{o.date}</span>
                        {o.type === 'MODIFIED_HOURS' && o.newStartTime && o.newEndTime && (
                          <span className="text-muted-foreground">{o.newStartTime}–{o.newEndTime}</span>
                        )}
                        {o.reason && <span className="text-muted-foreground truncate">· {o.reason}</span>}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto h-6 w-6 p-0"
                          onClick={() => removeOverride(s.id, o.date)}
                          aria-label="Remove override"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => router.push(`/?view=tracker&scheduleId=${s.id}&date=${new Date().toISOString().split('T')[0]}`)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('viewTracker')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => shareTracker(s.id)}
                    aria-label={t('shareTracker')}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openOverrideDialog(s)}
                        aria-label="Add override"
                        title="Add override (close/modify a date)"
                      >
                        <CalendarX className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('editSchedule') : t('addNewSchedule')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>{t('doctor')}</Label>
              <Select
                value={form.doctorId}
                onValueChange={(v) => setForm({ ...form, doctorId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectDoctor')} />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName} · {d.specialization}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('pinCode')}</Label>
                <Input
                  type="number"
                  value={form.pinCode}
                  onChange={(e) => setForm({ ...form, pinCode: parseInt(e.target.value) || 0 })}
                  min={100000}
                  max={999999}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('dayOfWeek')}</Label>
                <Select
                  value={form.dayOfWeek}
                  onValueChange={(v) => setForm({ ...form, dayOfWeek: v as ScheduleForm['dayOfWeek'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('startTime')}</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('endTime')}</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('clinicName')}</Label>
              <Input
                value={form.clinicName}
                onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
                placeholder="Sen Eye Clinic"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('clinicAddress')}</Label>
              <Input
                value={form.clinicAddress}
                onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })}
                placeholder="123 Park Street"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('avgTimePerPatient')}</Label>
              <Input
                type="number"
                value={form.avgMinutesPerPatient}
                onChange={(e) => setForm({ ...form, avgMinutesPerPatient: parseInt(e.target.value) || 10 })}
                min={1}
                max={180}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('cancelBtn')}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}?</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDeleteSchedule')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Override Dialog (Task 1.4) */}
      <Dialog
        open={overrideDialog.open}
        onOpenChange={(open) => setOverrideDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarX className="w-4 h-4" />
              Schedule Override
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              {overrideDialog.scheduleLabel}
            </p>
            <div className="space-y-2">
              <Label>Date (YYYY-MM-DD)</Label>
              <Input
                type="date"
                value={overrideDialog.date}
                onChange={(e) => setOverrideDialog((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Override type</Label>
              <Select
                value={overrideDialog.type}
                onValueChange={(v) => setOverrideDialog((prev) => ({ ...prev, type: v as OverrideDialogState['type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLOSED">Closed (no appointments)</SelectItem>
                  <SelectItem value="MODIFIED_HOURS">Modified hours</SelectItem>
                  <SelectItem value="SPECIAL">Special (note only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {overrideDialog.type === 'MODIFIED_HOURS' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>New start time</Label>
                  <Input
                    type="time"
                    value={overrideDialog.newStartTime}
                    onChange={(e) => setOverrideDialog((prev) => ({ ...prev, newStartTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>New end time</Label>
                  <Input
                    type="time"
                    value={overrideDialog.newEndTime}
                    onChange={(e) => setOverrideDialog((prev) => ({ ...prev, newEndTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                rows={2}
                placeholder="e.g., অসুস্থ / Illness / পূজা / Festival"
                value={overrideDialog.reason}
                onChange={(e) => setOverrideDialog((prev) => ({ ...prev, reason: e.target.value }))}
              />
            </div>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
              <strong>Note:</strong> If you close today, the bot will notify all
              patients who have appointments for that date.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverrideDialog((prev) => ({ ...prev, open: false }))}
              disabled={overrideDialog.saving}
            >
              {t('cancel')}
            </Button>
            <Button onClick={saveOverride} disabled={overrideDialog.saving}>
              {overrideDialog.saving ? 'Saving...' : 'Save Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
