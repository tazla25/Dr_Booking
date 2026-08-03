// /home/z/my-project/src/components/views/admin-verification-view.tsx
//
// Phase 1 reform (Task 1.2): Super admin view for approving/rejecting pending doctors.
// Shows a list of doctors with verificationStatus === 'PENDING' and lets the super
// admin approve or reject each one. Reject requires a reason.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { useApp } from '../providers'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Phone,
  Award,
  Stethoscope,
  Calendar,
  FileText,
  RefreshCw,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'

interface PendingDoctor {
  id: string
  name: string
  phone: string
  medicalRegNumber: string | null
  specialization: string | null
  verificationDocs: unknown
  telegramChatId: string | null
  createdAt: string
}

interface RejectDialogState {
  open: boolean
  doctorId: string | null
  doctorName: string | null
  reason: string
}

export function AdminVerificationView() {
  const { user } = useApp()
  const [pending, setPending] = useState<PendingDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<RejectDialogState>({
    open: false,
    doctorId: null,
    doctorName: null,
    reason: '',
  })

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ pendingDoctors: PendingDoctor[] }>('/api/admin/pending-doctors')
      setPending(data.pendingDoctors)
    } catch {
      toast.error('Failed to load pending doctors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      fetchPending()
    }
  }, [user, fetchPending])

  const approve = async (doctorId: string) => {
    setActing(doctorId)
    try {
      await api('/api/admin/verify-doctor', {
        method: 'POST',
        body: JSON.stringify({ doctorAdminId: doctorId, action: 'approve' }),
      })
      toast.success('Doctor approved and verified')
      setPending((prev) => prev.filter((d) => d.id !== doctorId))
    } catch (e) {
      toast.error((e as Error).message || 'Failed to approve doctor')
    } finally {
      setActing(null)
    }
  }

  const openRejectDialog = (doctorId: string, doctorName: string) => {
    setRejectDialog({ open: true, doctorId, doctorName, reason: '' })
  }

  const confirmReject = async () => {
    if (!rejectDialog.doctorId) return
    if (rejectDialog.reason.trim().length < 5) {
      toast.error('Please provide a reason (at least 5 characters)')
      return
    }
    setActing(rejectDialog.doctorId)
    try {
      await api('/api/admin/verify-doctor', {
        method: 'POST',
        body: JSON.stringify({
          doctorAdminId: rejectDialog.doctorId,
          action: 'reject',
          reason: rejectDialog.reason.trim(),
        }),
      })
      toast.success(`Doctor ${rejectDialog.doctorName} rejected`)
      setPending((prev) => prev.filter((d) => d.id !== rejectDialog.doctorId))
      setRejectDialog({ open: false, doctorId: null, doctorName: null, reason: '' })
    } catch (e) {
      toast.error((e as Error).message || 'Failed to reject doctor')
    } finally {
      setActing(null)
    }
  }

  // Only super admins should reach this view; render a guard just in case
  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold">Access restricted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Only super admins can verify doctors.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Verify Doctors
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and approve new doctor registrations. Verify medical registration
            numbers against the WBMC/MCI registry before approving.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading} className="gap-2 self-start">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
            <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {pending.length}
            </span>
          </div>
          <div>
            <p className="font-medium">Pending verifications</p>
            <p className="text-sm text-muted-foreground">
              {pending.length === 0
                ? 'All caught up. No pending applications.'
                : `${pending.length} doctor${pending.length === 1 ? '' : 's'} waiting for review.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-base font-semibold">No pending applications</h3>
            <p className="text-sm text-muted-foreground mt-1">
              When a new doctor registers via the bot, they will appear here for your review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((doc) => {
            const docs = (doc.verificationDocs || {}) as Record<string, unknown>
            const chamberAddress = typeof docs.chamberAddress === 'string' ? docs.chamberAddress : null
            return (
              <Card key={doc.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Stethoscope className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{doc.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Applied {new Date(doc.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                      PENDING
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Details grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{doc.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Award className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Medical Reg. Number</p>
                        <p className="font-medium font-mono">{doc.medicalRegNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Stethoscope className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Specialization</p>
                        <p className="font-medium">{doc.specialization || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Telegram Chat ID</p>
                        <p className="font-medium font-mono text-xs">{doc.telegramChatId || '—'}</p>
                      </div>
                    </div>
                    {chamberAddress && (
                      <div className="flex items-start gap-2 sm:col-span-2">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Chamber Address (self-reported)</p>
                          <p className="font-medium">{chamberAddress}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Verification hint */}
                  <div className="bg-muted/40 rounded-md p-3 text-xs text-muted-foreground">
                    <strong className="text-foreground">Before approving:</strong> Verify the medical
                    registration number <code className="px-1 py-0.5 bg-background rounded border border-border">{doc.medicalRegNumber}</code> against the
                    official WBMC/MCI registry. If invalid, reject with a clear reason.
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      onClick={() => approve(doc.id)}
                      disabled={acting === doc.id}
                      className="gap-2"
                    >
                      {acting === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Approve &amp; Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openRejectDialog(doc.id, doc.name)}
                      disabled={acting === doc.id}
                      className="gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) => {
          if (!open) setRejectDialog({ open: false, doctorId: null, doctorName: null, reason: '' })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject doctor application</DialogTitle>
            <DialogDescription>
              Provide a clear reason for rejecting <strong>{rejectDialog.doctorName}</strong>.
              The reason will be stored for audit purposes. The doctor will not be able to log in
              and will need to re-register if they want to apply again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="e.g., Medical registration number could not be verified in WBMC registry. Please contact support."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog({ open: false, doctorId: null, doctorName: null, reason: '' })}
              disabled={acting === rejectDialog.doctorId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={acting === rejectDialog.doctorId || rejectDialog.reason.trim().length < 5}
              className="gap-2"
            >
              {acting === rejectDialog.doctorId && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
