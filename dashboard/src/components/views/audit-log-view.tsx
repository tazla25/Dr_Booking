// /home/z/my-project/src/components/views/audit-log-view.tsx (Task 5.2)
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ScrollArea } from '../ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Search, Download, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { toast } from 'sonner'

interface AuditEntry { id: number; action: string; target: string | null; detail: string | null; ipAddress: string | null; createdAt: string; adminUser: { name: string; email: string | null; role: string } | null }
const ACTION_LABELS: Record<string, string> = { magic_link_generated: 'Magic link generated', magic_link_login: 'Login', 'appointment.create': 'Booking created', 'appointment.walkin': 'Walk-in added', 'appointment.status': 'Status changed', 'appointment.reschedule': 'Rescheduled', 'appointment.delete': 'Deleted', 'doctor.create': 'Doctor created', 'doctor.update': 'Doctor updated', 'doctor.delete': 'Doctor deleted', 'schedule.create': 'Schedule created', 'schedule.update': 'Schedule updated', 'schedule.delete': 'Schedule deleted', 'schedule.override': 'Schedule override', 'schedule.override.remove': 'Override removed', 'queue.next': 'Called next', 'verification.approve': 'Doctor approved', 'verification.reject': 'Doctor rejected', 'compounder.invite': 'Compounder invited', 'compounder.remove': 'Compounder removed' }
const ACTION_COLORS: Record<string, string> = { magic_link_generated: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400', magic_link_login: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400', 'appointment.create': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400', 'appointment.walkin': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400', 'appointment.delete': 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400', 'doctor.delete': 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400', 'schedule.delete': 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400', 'verification.reject': 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400', 'verification.approve': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400', 'schedule.override': 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' }
const PAGE_SIZE = 50

export function AuditLogView() {
  const { user } = useApp()
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [actionFilter, setActionFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE)); params.set('offset', String(offset))
      if (actionFilter !== 'all') params.set('action', actionFilter)
      if (searchQuery) params.set('q', searchQuery)
      const d = await api<{ logs: AuditEntry[]; total: number }>(`/api/audit-log?${params.toString()}`)
      setLogs(d.logs); setTotal(d.total)
    } catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [offset, actionFilter, searchQuery])
  useEffect(() => { fetch() }, [fetch])
  const exportCsv = () => {
    if (!logs.length) return
    const rows = [['Timestamp', 'User', 'Role', 'Action', 'Target', 'Detail', 'IP'], ...logs.map(l => [new Date(l.createdAt).toISOString(), l.adminUser?.name || '', l.adminUser?.role || '', ACTION_LABELS[l.action] || l.action, l.target || '', l.detail || '', l.ipAddress || ''])]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }
  const totalPages = Math.ceil(total / PAGE_SIZE), currentPage = Math.floor(offset / PAGE_SIZE) + 1
  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><ScrollText className="w-6 h-6 text-primary" />Audit Log</h1><p className="text-muted-foreground text-sm mt-1">{user?.role === 'SUPER_ADMIN' ? 'You see all logs.' : 'Scoped to your access.'}</p></div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={logs.length === 0} className="gap-2 self-start"><Download className="w-4 h-4" />Export CSV</Button>
      </div>
      <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Action type</Label><Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setOffset(0) }}><SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem>{Object.entries(ACTION_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label className="text-xs">Search detail</Label><div className="flex gap-2"><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search..." onKeyDown={(e) => { if (e.key === 'Enter') { setOffset(0); setSearchQuery(searchInput.trim()) } }} /><Button size="sm" onClick={() => { setOffset(0); setSearchQuery(searchInput.trim()) }} className="gap-1"><Search className="w-4 h-4" /></Button></div></div>
        <div className="flex items-end"><Button variant="ghost" size="sm" onClick={() => { setActionFilter('all'); setSearchQuery(''); setSearchInput(''); setOffset(0) }} className="w-full">Clear filters</Button></div>
      </CardContent></Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}</CardTitle><CardDescription>Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)}</CardDescription></CardHeader>
        <CardContent>
          {loading ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}</div>
          : logs.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground"><ScrollText className="w-10 h-10 mx-auto mb-3 opacity-40" />No audit entries match your filters.</div>
          : (<ScrollArea className="h-[60vh]"><Table><TableHeader><TableRow><TableHead className="w-40">Timestamp</TableHead><TableHead className="w-32">User</TableHead><TableHead className="w-40">Action</TableHead><TableHead>Detail</TableHead><TableHead className="w-32">IP</TableHead></TableRow></TableHeader><TableBody>{logs.map(l => (<TableRow key={l.id}><TableCell className="text-xs text-muted-foreground font-mono">{new Date(l.createdAt).toLocaleString()}</TableCell><TableCell><p className="text-xs font-medium">{l.adminUser?.name || 'system'}</p><p className="text-[10px] text-muted-foreground">{l.adminUser?.role || ''}</p></TableCell><TableCell><Badge variant="secondary" className={`text-[10px] ${ACTION_COLORS[l.action] || 'bg-muted text-muted-foreground'}`}>{ACTION_LABELS[l.action] || l.action}</Badge></TableCell><TableCell className="text-xs">{l.detail || <span className="text-muted-foreground">—</span>}{l.target && <span className="block text-[10px] text-muted-foreground mt-0.5 font-mono">target: {l.target}</span>}</TableCell><TableCell className="text-xs text-muted-foreground font-mono">{l.ipAddress || '—'}</TableCell></TableRow>))}</TableBody></Table></ScrollArea>)}
          {totalPages > 1 && (<div className="flex items-center justify-between mt-4"><p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="gap-1"><ChevronLeft className="w-4 h-4" />Prev</Button><Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} className="gap-1">Next<ChevronRight className="w-4 h-4" /></Button></div></div>)}
        </CardContent>
      </Card>
    </div>
  )
}
