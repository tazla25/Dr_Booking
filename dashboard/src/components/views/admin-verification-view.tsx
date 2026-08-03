// /home/z/my-project/src/components/views/admin-verification-view.tsx (Task 1.2)
'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { useApp } from '../providers'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { ShieldCheck, Loader2, CheckCircle2, XCircle, Phone, Award, Stethoscope, Calendar, FileText, RefreshCw, Inbox } from 'lucide-react'
import { toast } from 'sonner'

interface PendingDoctor { id: string; name: string; phone: string; medicalRegNumber: string | null; specialization: string | null; verificationDocs: unknown; telegramChatId: string | null; createdAt: string }

export function AdminVerificationView() {
  const { user } = useApp()
  const [pending, setPending] = useState<PendingDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState({ open: false, doctorId: '', doctorName: '', reason: '' })
  const fetchPending = useCallback(async () => {
    setLoading(true)
    try { const d = await api<{ pendingDoctors: PendingDoctor[] }>('/api/admin/pending-doctors'); setPending(d.pendingDoctors) }
    catch { toast.error('Failed to load pending doctors') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (user?.role === 'SUPER_ADMIN') fetchPending() }, [user, fetchPending])
  const approve = async (id: string) => {
    setActing(id)
    try { await api('/api/admin/verify-doctor', { method: 'POST', body: JSON.stringify({ doctorAdminId: id, action: 'approve' }) }); toast.success('Doctor approved'); setPending(p => p.filter(d => d.id !== id)) }
    catch (e) { toast.error((e as Error).message) }
    finally { setActing(null) }
  }
  const confirmReject = async () => {
    if (rejectDialog.reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setActing(rejectDialog.doctorId)
    try { await api('/api/admin/verify-doctor', { method: 'POST', body: JSON.stringify({ doctorAdminId: rejectDialog.doctorId, action: 'reject', reason: rejectDialog.reason.trim() }) }); toast.success('Doctor rejected'); setPending(p => p.filter(d => d.id !== rejectDialog.doctorId)); setRejectDialog({ open: false, doctorId: '', doctorName: '', reason: '' }) }
    catch (e) { toast.error((e as Error).message) }
    finally { setActing(null) }
  }
  if (user?.role !== 'SUPER_ADMIN') return (<div className="max-w-3xl mx-auto"><Card><CardContent className="p-8 text-center"><ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><h2 className="text-lg font-semibold">Access restricted</h2><p className="text-sm text-muted-foreground mt-1">Only super admins can verify doctors.</p></CardContent></Card></div>)
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-primary" />Verify Doctors</h1><p className="text-muted-foreground text-sm mt-1">Review and approve new doctor registrations.</p></div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading} className="gap-2 self-start"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      <Card><CardContent className="p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center"><span className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pending.length}</span></div><div><p className="font-medium">Pending verifications</p><p className="text-sm text-muted-foreground">{pending.length === 0 ? 'All caught up.' : `${pending.length} doctor${pending.length === 1 ? '' : 's'} waiting.`}</p></div></CardContent></Card>
      {loading ? (<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>)
      : pending.length === 0 ? (<Card><CardContent className="p-12 text-center"><Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><h3 className="text-base font-semibold">No pending applications</h3><p className="text-sm text-muted-foreground mt-1">When a new doctor registers via the bot, they will appear here.</p></CardContent></Card>)
      : (<div className="space-y-4">{pending.map(doc => {
        const docs = (doc.verificationDocs || {}) as Record<string, unknown>
        const chamber = typeof docs.chamberAddress === 'string' ? docs.chamberAddress : null
        return (
          <Card key={doc.id}>
            <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Stethoscope className="w-5 h-5 text-primary" /></div><div><CardTitle className="text-base">{doc.name}</CardTitle><p className="text-xs text-muted-foreground">Applied {new Date(doc.createdAt).toLocaleString()}</p></div></div><Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">PENDING</Badge></div></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2"><Phone className="w-4 h-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{doc.phone}</p></div></div>
                <div className="flex items-start gap-2"><Award className="w-4 h-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Medical Reg. Number</p><p className="font-medium font-mono">{doc.medicalRegNumber}</p></div></div>
                <div className="flex items-start gap-2"><Stethoscope className="w-4 h-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Specialization</p><p className="font-medium">{doc.specialization || '—'}</p></div></div>
                <div className="flex items-start gap-2"><Calendar className="w-4 h-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Telegram Chat ID</p><p className="font-medium font-mono text-xs">{doc.telegramChatId || '—'}</p></div></div>
                {chamber && (<div className="flex items-start gap-2 sm:col-span-2"><FileText className="w-4 h-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">Chamber Address</p><p className="font-medium">{chamber}</p></div></div>)}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button size="sm" onClick={() => approve(doc.id)} disabled={acting === doc.id} className="gap-2">{acting === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Approve &amp; Verify</Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectDialog({ open: true, doctorId: doc.id, doctorName: doc.name, reason: '' })} disabled={acting === doc.id} className="gap-2"><XCircle className="w-4 h-4" />Reject</Button>
              </div>
            </CardContent>
          </Card>
        )
      })}</div>)}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => { if (!o) setRejectDialog({ open: false, doctorId: '', doctorName: '', reason: '' }) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject doctor application</DialogTitle><DialogDescription>Provide a reason for rejecting <strong>{rejectDialog.doctorName}</strong>.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="reject-reason">Reason</Label><Textarea id="reject-reason" value={rejectDialog.reason} onChange={(e) => setRejectDialog(p => ({ ...p, reason: e.target.value }))} placeholder="e.g., Medical registration number not found in WBMC registry." rows={4} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, doctorId: '', doctorName: '', reason: '' })} disabled={acting === rejectDialog.doctorId}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={acting === rejectDialog.doctorId || rejectDialog.reason.trim().length < 5} className="gap-2">{acting === rejectDialog.doctorId && <Loader2 className="w-4 h-4 animate-spin" />}Confirm Rejection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
