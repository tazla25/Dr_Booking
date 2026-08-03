// /home/z/my-project/src/components/walk-in-quick-add.tsx
//
// Phase 1 reform (Task 1.5): Floating action button + modal for compounders
// to add walk-in patients in under 5 seconds. Minimal fields, auto-clears
// for rapid-fire entry. Shows recent walk-ins added today with Undo.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApp } from './providers'
import { api } from '@/lib/api-client'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Plus, X, Undo2, Loader2, Zap, UserCheck } from 'lucide-react'
import { toast } from 'sonner'

interface WalkInResult {
  appointment: {
    id: string
    queueNumber: number
    patientName: string
    patientPhone: string
    appointmentDate: string
  }
}

interface RecentWalkIn {
  id: string
  patientName: string
  queueNumber: number
  addedAt: number
}

interface Props {
  /** Optional: pre-selected scheduleId. If null, the modal shows a schedule picker. */
  schedules: Array<{
    id: string
    dayOfWeek: string
    startTime: string
    endTime: string
    clinicName: string | null
    doctor: { id: string; fullName: string; specialization: string } | null
  }>
  /** Called after a walk-in is successfully added (so parent can refresh). */
  onAdded?: () => void
}

export function WalkInQuickAdd({ schedules, onAdded }: Props) {
  const { t } = useApp()
  const [open, setOpen] = useState(false)
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [scheduleId, setScheduleId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [recentWalkIns, setRecentWalkIns] = useState<RecentWalkIn[]>([])

  // Pick today's schedule by default (first one whose dayOfWeek matches today)
  useEffect(() => {
    if (!open) return
    if (schedules.length === 0) return
    if (scheduleId) return // user has already picked one
    const today = new Date().getDay()
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today]
    const todaySched = schedules.find((s) => s.dayOfWeek === dayName)
    setScheduleId(todaySched?.id || schedules[0]?.id || '')
  }, [open, schedules, scheduleId])

  // Keyboard shortcut: press 'a' to open the quick-add modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'a') return
      // Ignore if user is typing in an input/textarea, or if a modifier is held
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (open) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const today = new Date().toISOString().split('T')[0]

  const reset = () => {
    setPatientName('')
    setPatientPhone('')
    setScheduleId('')
  }

  const submit = async () => {
    if (!patientName.trim() || patientName.trim().length < 2) {
      toast.error('Patient name is required (min 2 chars)')
      return
    }
    if (!scheduleId) {
      toast.error('Please select a chamber')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        scheduleId,
        patientName: patientName.trim(),
        appointmentDate: today,
      }
      // Phone is optional — but the API requires it. If not provided, send a
      // sentinel that's clearly a walk-in (no real phone).
      body.patientPhone = patientPhone.trim() || '+0000000000'

      const data = await api<WalkInResult>('/api/appointments/walk-in', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      toast.success(`Added to queue: token #${data.appointment.queueNumber}`)
      setRecentWalkIns((prev) => [
        {
          id: data.appointment.id,
          patientName: data.appointment.patientName,
          queueNumber: data.appointment.queueNumber,
          addedAt: Date.now(),
        },
        ...prev,
      ].slice(0, 5))

      // Clear name + phone but keep the schedule selected (for rapid-fire entry)
      setPatientName('')
      setPatientPhone('')
      onAdded?.()

      // Auto-close after 800ms if user hasn't started typing again
      // (gives time to see the success toast)
      setTimeout(() => {
        if (!patientName) setOpen(false) // only close if user hasn't typed anything new
      }, 800)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to add walk-in')
    } finally {
      setSaving(false)
    }
  }

  const undo = async (id: string) => {
    try {
      await api(`/api/appointments/${id}`, { method: 'DELETE' })
      setRecentWalkIns((prev) => prev.filter((w) => w.id !== id))
      toast.success('Walk-in removed')
      onAdded?.()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to undo')
    }
  }

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
        aria-label="Quick add walk-in patient (press A)"
        title="Quick add walk-in (press A)"
      >
        <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
      </button>

      {/* Recent Walk-ins panel (only shown if there are any) */}
      {recentWalkIns.length > 0 && (
        <div className="fixed bottom-24 right-6 z-30 w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold">Recent walk-ins</p>
            <button
              onClick={() => setRecentWalkIns([])}
              className="ml-auto text-muted-foreground hover:text-foreground"
              aria-label="Clear recent walk-ins"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <ul className="divide-y divide-border max-h-60 overflow-y-auto">
            {recentWalkIns.map((w) => (
              <li key={w.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{w.patientName}</p>
                  <p className="text-xs text-muted-foreground">Token #{w.queueNumber}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => undo(w.id)}
                >
                  <Undo2 className="w-3 h-3" />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick Add Modal */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Quick Add Walk-in
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Add a walk-in patient to today&apos;s queue in seconds. Phone is optional.
            </p>

            {/* Schedule picker (only if more than one) */}
            {schedules.length > 1 && (
              <div className="space-y-2">
                <Label>Chamber</Label>
                <select
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.doctor?.fullName} · {s.clinicName || s.dayOfWeek} {s.startTime}–{s.endTime}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Patient name *</Label>
              <Input
                autoFocus
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g., Rahul Das"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Patient phone (optional)</Label>
              <Input
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="e.g., +919876543210"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
            </div>

            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
              Tip: press <kbd className="px-1 py-0.5 bg-background rounded border border-border text-[10px]">A</kbd> on the
              dashboard to open this modal quickly. Press Enter to add.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={saving || !patientName.trim()} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add to Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
