// /home/z/my-project/src/components/views/patients-view.tsx
// Patient Management View — list patients, search, view history.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Textarea } from '../ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import {
  Search,
  Users,
  Phone,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  UserX,
  Star,
  Stethoscope,
  ChevronRight,
  Loader2,
  IndianRupee,
  StickyNote,
  Pin,
  Trash2,
  Send,
  AlertCircle,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { ExportButton } from '../export-button'
import { parseISO } from 'date-fns' // NEW-008: stable date parsing across browsers
import { ReceiptDialog } from '../receipt-dialog'

interface Patient {
  phone: string
  name: string
  totalAppointments: number
  lastVisit: string
  firstVisit: string
  doctors: string[]
  lastStatus: string
  completedCount: number
  noShowCount: number
  cancelledCount: number
}

interface PatientDetail {
  patient: {
    phone: string
    name: string
    totalAppointments: number
    completed: number
    noShow: number
    cancelled: number
    confirmed: number
    noShowRate: number
    completionRate: number
    doctors: Array<{ name: string; specialization: string }>
    firstVisit: string
    lastVisit: string
    averageRating: number
    feedbackCount: number
  }
  appointments: Array<{
    id: string
    date: string
    queueNumber: number
    status: string
    notes: string | null
    doctor: { id: string; fullName: string; specialization: string } | null
    clinic: string | null
    time: string | null
    feedback: { rating: number; comment: string | null } | null
  }>
  feedback: Array<{ rating: number; comment: string | null; date: string; doctor: string }>
}

interface PatientNote {
  id: string
  patientPhone: string
  note: string
  isImportant: boolean
  createdAt: string
  updatedAt: string
  author: { id: string; name: string; role: string }
}

interface PatientReceipt {
  appointmentId: string
  receiptNo: string
  date: string
  queueNumber: number
  doctorName: string
  specialization: string
  clinic: string
  fee: number
  rating: number | null
  comment: string | null
}

export function PatientsView() {
  const { t, lang, user } = useApp()
  const [patients, setPatients] = useState<Patient[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [detail, setDetail] = useState<PatientDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [notes, setNotes] = useState<PatientNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [noteImportant, setNoteImportant] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [receipts, setReceipts] = useState<PatientReceipt[]>([])
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptApptId, setReceiptApptId] = useState<string | null>(null)
  // IMP-V4-003: custom patient messaging state
  const [customMsg, setCustomMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '100')
      if (q) params.set('q', q)
      const data = await api<{ patients: Patient[]; total: number }>(`/api/patients?${params.toString()}`)
      setPatients(data.patients)
      setTotal(data.total)
    } catch {
      toast.error(t('error'))
    } finally {
      setLoading(false)
    }
  }, [q, t])

  useEffect(() => {
    const handler = setTimeout(() => fetchPatients(), 300)
    return () => clearTimeout(handler)
  }, [fetchPatients])

  const openDetail = async (phone: string) => {
    setSelectedPhone(phone)
    setLoadingDetail(true)
    setDetail(null)
    setNotes([])
    setReceipts([])
    setNewNote('')
    setNoteImportant(false)
    try {
      const [data, notesData, receiptsData] = await Promise.all([
        api<PatientDetail>(`/api/patients/${encodeURIComponent(phone)}`),
        api<{ notes: PatientNote[] }>(`/api/patients/${encodeURIComponent(phone)}/notes`).catch(() => ({ notes: [] })),
        api<{ receipts: PatientReceipt[] }>(`/api/patients/${encodeURIComponent(phone)}/receipts`).catch(() => ({ receipts: [] })),
      ])
      setDetail(data)
      setNotes(notesData.notes)
      setReceipts(receiptsData.receipts)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load patient details')
      setSelectedPhone(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  const openReceipt = (appointmentId: string) => {
    setReceiptApptId(appointmentId)
    setReceiptOpen(true)
  }

  const fetchNotes = async (phone: string) => {
    setLoadingNotes(true)
    try {
      const data = await api<{ notes: PatientNote[] }>(`/api/patients/${encodeURIComponent(phone)}/notes`)
      setNotes(data.notes)
    } catch {
      // ignore
    } finally {
      setLoadingNotes(false)
    }
  }

  const addNote = async () => {
    if (!selectedPhone || !newNote.trim()) return
    setSavingNote(true)
    try {
      const data = await api<{ note: PatientNote }>(`/api/patients/${encodeURIComponent(selectedPhone)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: newNote.trim(), isImportant: noteImportant }),
      })
      setNotes((prev) => [data.note, ...prev])
      setNewNote('')
      setNoteImportant(false)
      toast.success('Note added')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to add note')
    } finally {
      setSavingNote(false)
    }
  }

  const toggleNoteImportant = async (noteId: string, current: boolean) => {
    try {
      const data = await api<{ note: PatientNote }>(`/api/patient-notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isImportant: !current }),
      })
      setNotes((prev) =>
        prev
          .map((n) => (n.id === noteId ? data.note : n))
          .sort((a, b) => {
            if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          })
      )
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update note')
    }
  }

  const deleteNote = async (noteId: string) => {
    try {
      await api(`/api/patient-notes/${noteId}`, { method: 'DELETE' })
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
      toast.success('Note deleted')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete note')
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    // NEW-008 fix: use date-fns parseISO instead of `new Date(dateStr + 'T00:00:00')`.
    // The raw constructor interprets the date as UTC in some browsers (Safari)
    // and local time in others, which can shift the date by a day in non-IST
    // timezones. parseISO treats a date-only string as local midnight, which
    // is what we want since the rest of the app standardizes on Asia/Kolkata.
    const d = parseISO(dateStr)
    return d.toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
      Confirmed: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
      Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
      Cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
      NoShow: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
    }
    return map[status] || map.Confirmed
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" />
            Patients
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? 'Loading...' : `${total} ${total === 1 ? 'patient' : 'patients'} registered`}
          </p>
        </div>
        <ExportButton defaultType="patients" label="Export Patients" />
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone number..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </CardContent>
      </Card>

      {/* Patient List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : patients.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold mb-1">No patients found</h3>
            <p className="text-muted-foreground text-sm">
              {q ? 'Try a different search term.' : 'Patients will appear here once they book appointments.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((p) => (
            <Card
              key={p.phone}
              className="overflow-hidden hover:shadow-lg transition-all cursor-pointer border-border/50 hover:border-primary/30"
              onClick={() => openDetail(p.phone)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-primary text-sm">
                      {p.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{p.name}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Phone className="w-3 h-3" />{p.phone}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border">
                  <div>
                    <p className="text-lg font-bold text-foreground">{p.totalAppointments}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{p.completedCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Done</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{p.noShowCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">No-show</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Calendar className="w-3 h-3" />
                  <span>Last: {formatDate(p.lastVisit)}</span>
                  {p.doctors.length > 0 && (
                    <>
                      <span>·</span>
                      <Stethoscope className="w-3 h-3" />
                      <span className="truncate">{p.doctors[0]}</span>
                      {p.doctors.length > 1 && <span>+{p.doctors.length - 1}</span>}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Patient Detail Dialog */}
      <Dialog open={!!selectedPhone} onOpenChange={(o) => !o && setSelectedPhone(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Patient Details
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Patient Profile */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-accent/10">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary text-lg">
                    {detail.patient.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-foreground">{detail.patient.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />{detail.patient.phone}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Since {formatDate(detail.patient.firstVisit)}
                    </span>
                    {detail.patient.averageRating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        {detail.patient.averageRating}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox icon={Calendar} label="Total" value={detail.patient.totalAppointments} color="primary" />
                <StatBox icon={CheckCircle2} label="Completed" value={detail.patient.completed} color="emerald" />
                <StatBox icon={UserX} label="No-show" value={`${detail.patient.noShow} (${detail.patient.noShowRate}%)`} color="amber" />
                <StatBox icon={XCircle} label="Cancelled" value={detail.patient.cancelled} color="rose" />
              </div>

              {/* IMP-V4-003: Custom patient messaging — send a WhatsApp
                  message to this patient directly from the dashboard. */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Send WhatsApp Message
                </Label>
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={customMsg}
                    onChange={(e) => setCustomMsg(e.target.value)}
                    placeholder="Type a custom message (e.g., 'Doctor is delayed by 1 hour', 'Please bring your reports')..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!customMsg.trim() || !selectedPhone) return
                      setSendingMsg(true)
                      try {
                        const res = await fetch('/api/patients/notify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ chatIds: [selectedPhone], text: customMsg.trim() }),
                        })
                        const result = await res.json()
                        if (result.ok) {
                          toast.success('Message sent to patient')
                          setCustomMsg('')
                        } else {
                          toast.error(`Failed to send: ${result.error || 'unknown error'}`)
                        }
                      } catch (e) {
                        toast.error((e as Error).message || 'Failed to send message')
                      } finally {
                        setSendingMsg(false)
                      }
                    }}
                    disabled={sendingMsg || !customMsg.trim()}
                    className="gap-1.5"
                  >
                    {sendingMsg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send to Patient
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    Note: message will only be delivered if the patient is within WhatsApp's 24-hour conversation window.
                  </p>
                </div>
              </div>

              {/* Doctors Seen */}
              {detail.patient.doctors.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Doctors Visited</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {detail.patient.doctors.map((d, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <Stethoscope className="w-3 h-3" />
                        {d.name} · {d.specialization}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Appointment History */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Appointment History</Label>
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                  {detail.appointments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">#{a.queueNumber}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {a.doctor?.fullName || 'Unknown'}
                          <span className="text-muted-foreground font-normal"> · {formatDate(a.date)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.clinic && <span>{a.clinic}</span>}
                          {a.time && <span> · {a.time}</span>}
                          {a.notes && <span> · {a.notes}</span>}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                      {a.feedback && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                          {a.feedback.rating}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Feedback */}
              {detail.feedback.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Patient Feedback</Label>
                  <div className="mt-2 space-y-2">
                    {detail.feedback.slice(0, 5).map((f, i) => (
                      <div key={i} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="gap-1">
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            {f.rating}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(f.date)} · {f.doctor}</span>
                        </div>
                        {f.comment && <p className="text-sm">{f.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoice / Receipt History */}
              {receipts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Invoice History
                    </Label>
                    <Badge variant="secondary" className="text-[10px]">
                      {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'} · ₹{receipts.reduce((s, r) => s + r.fee, 0).toLocaleString('en-IN')}
                    </Badge>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {receipts.map((r) => (
                      <div
                        key={r.appointmentId}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer group"
                        onClick={() => openReceipt(r.appointmentId)}
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <IndianRupee className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{r.doctorName}</p>
                            <span className="text-[10px] text-muted-foreground font-mono">{r.receiptNo}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(r.date)} · {r.clinic} · Queue #{r.queueNumber}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {r.rating && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                              {r.rating}
                            </Badge>
                          )}
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{r.fee}</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Patient Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5" />
                    Internal Notes
                  </Label>
                  {notes.filter((n) => n.isImportant).length > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Pin className="w-2.5 h-2.5" />
                      {notes.filter((n) => n.isImportant).length} pinned
                    </Badge>
                  )}
                </div>

                {/* Add note form */}
                <div className="space-y-2 mb-3">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add an internal note about this patient (e.g., allergies, preferences, special needs)..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noteImportant}
                        onChange={(e) => setNoteImportant(e.target.checked)}
                        className="rounded"
                      />
                      <Pin className="w-3 h-3" />
                      Mark as important
                    </label>
                    <Button
                      size="sm"
                      onClick={addNote}
                      disabled={savingNote || !newNote.trim()}
                      className="gap-1.5"
                    >
                      {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Add Note
                    </Button>
                  </div>
                </div>

                {/* Notes list */}
                {loadingNotes ? (
                  <Skeleton className="h-20 w-full" />
                ) : notes.length === 0 ? (
                  <div className="text-center py-4 bg-muted/30 rounded-lg">
                    <StickyNote className="w-8 h-8 mx-auto text-muted-foreground/40 mb-1" />
                    <p className="text-xs text-muted-foreground">No notes yet. Add one above.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          note.isImportant
                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                            : 'bg-muted/40 border-border hover:bg-muted/60'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{note.note}</p>
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                              <span className="font-medium">{note.author.name}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span>{note.author.role}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span>{new Date(note.createdAt).toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-7 w-7 p-0 ${note.isImportant ? 'text-amber-600' : 'text-muted-foreground/50'}`}
                              onClick={() => toggleNoteImportant(note.id, note.isImportant)}
                              title={note.isImportant ? 'Unpin' : 'Pin as important'}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </Button>
                            {(note.author.id === user?.id || user?.role === 'SUPER_ADMIN') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                onClick={() => deleteNote(note.id)}
                                title="Delete note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load patient details.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt dialog (for viewing past receipts from invoice history) */}
      <ReceiptDialog
        appointmentId={receiptApptId}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </div>
  )
}

function StatBox({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string | number; color: 'primary' | 'emerald' | 'amber' | 'rose' }) {
  const cm = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  }
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cm[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold truncate">{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  )
}
