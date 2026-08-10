// /home/z/my-project/src/components/views/doctor-report-view.tsx (Task 4.2)
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
// @ts-ignore
import { useQuery, useAction } from 'wasp/client/operations'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Calendar, Users, Star, TrendingUp, IndianRupee, Activity, Clock, ChevronLeft } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

interface Doctor {
  id: string
  fullName: string
  specialization: string
}

interface Report {
  doctor: { id: string; fullName: string; specialization: string; fee: number }
  range: { from: string; to: string }
  summary: { total: number; completed: number; noShow: number; cancelled: number; confirmed: number; noShowRate: number; completionRate: number; uniquePatients: number; returningPatients: number; returningRate: number; revenue: number; averageRating: number; feedbackCount: number }
  daily: Array<{ date: string; count: number }>
  byDayOfWeek: Array<{ day: string; count: number }>
  recentFeedback: Array<{ id: string; rating: number; comment: string | null; createdAt: string; patientName: string; appointmentDate: string }>
}
const DOW_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4']

export function DoctorReportView() {
  const { user } = useApp()
  const router = useRouter()
  const search = useSearchParams()
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  // BUG-010 fix: super admins get a dropdown of doctors instead of having
  // to type a raw CUID. We fetch the full doctor list from /api/doctors.
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState(search.get('doctorId') || user?.ownedDoctorId || user?.delegatedDoctorId || '')
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [to, setTo] = useState(new Date().toISOString().split('T')[0])

  // Fetch the doctor list for the super-admin dropdown.
  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') return
    api<{ doctors: Doctor[] }>('/api/doctors')
      .then((d) => setDoctors(d.doctors || []))
      .catch(() => { /* ignore — dropdown just stays empty */ })
  }, [user])

  const fetch = useCallback(async () => {
    if (!doctorId) return
    setLoading(true)
    try { const d = await api<Report>(`/api/analytics/doctor/${doctorId}?from=${from}&to=${to}`); setData(d) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [doctorId, from, to])
  useEffect(() => { fetch() }, [fetch])
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/?view=analytics')} className="gap-1 mb-1 -ml-2"><ChevronLeft className="w-4 h-4" />Back to Analytics</Button>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-primary" />Doctor Performance Report</h1>
      </div>
      <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* BUG-010 fix: super admins get a dropdown; non-super-admins see their own doctor name. */}
        {user?.role === 'SUPER_ADMIN' ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Doctor</Label>
            <Select value={doctorId} onValueChange={(v) => setDoctorId(v)}>
              <SelectTrigger>
                <SelectValue placeholder={doctors.length === 0 ? 'Loading doctors…' : 'Select a doctor'} />
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
        ) : (
          <div className="space-y-1.5"><Label className="text-xs">Doctor</Label><p className="text-sm font-medium py-2">{user?.doctor?.fullName || 'Your doctor'}</p></div>
        )}
        <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex items-end"><Button onClick={fetch} className="w-full gap-2"><TrendingUp className="w-4 h-4" />Generate</Button></div>
      </CardContent></Card>
      {loading || !data ? <Skeleton className="h-96" /> : (
        <>
          <Card><CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><Users className="w-6 h-6 text-primary" /></div>
            <div><p className="font-semibold text-lg">{data.doctor.fullName}</p><p className="text-sm text-muted-foreground">{data.doctor.specialization}</p></div>
            <div className="ml-auto text-right"><p className="text-xs text-muted-foreground">Fee</p><p className="font-bold text-lg flex items-center gap-1 justify-end"><IndianRupee className="w-4 h-4" />{data.doctor.fee}</p></div>
          </CardContent></Card>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SC icon={Calendar} label="Total" value={data.summary.total} c="primary" />
            <SC icon={TrendingUp} label="Completed" value={data.summary.completed} c="emerald" />
            <SC icon={Clock} label="No-show" value={`${data.summary.noShow} (${data.summary.noShowRate}%)`} c="rose" />
            <SC icon={Users} label="Patients" value={data.summary.uniquePatients} c="amber" />
            <SC icon={Star} label="Rating" value={`${data.summary.averageRating}★`} c="amber" />
            <SC icon={IndianRupee} label="Revenue" value={`₹${data.summary.revenue}`} c="emerald" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Daily Trend</CardTitle><CardDescription>{data.range.from} to {data.range.to}</CardDescription></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">By Day of Week</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byDayOfWeek}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" radius={[4,4,0,0]}>{data.byDayOfWeek.map((_, i) => <Cell key={i} fill={DOW_COLORS[i % DOW_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Recent Feedback</CardTitle><CardDescription>{data.summary.feedbackCount} responses · Return rate: {data.summary.returningRate}%</CardDescription></CardHeader><CardContent>{data.recentFeedback.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No feedback with comments yet.</p> : <ul className="space-y-2 max-h-80 overflow-y-auto">{data.recentFeedback.map(f => (<li key={f.id} className="bg-muted/40 rounded-md p-3"><div className="flex items-center gap-2 mb-1 text-xs"><Badge variant="secondary">{f.rating}★</Badge><span className="font-medium">{f.patientName}</span><span className="text-muted-foreground">· {f.appointmentDate}</span></div><p className="text-sm">{f.comment}</p></li>))}</ul>}</CardContent></Card>
        </>
      )}
    </div>
  )
}
function SC({ icon: Icon, label, value, c }: { icon: typeof Users; label: string; value: string | number; c: 'primary' | 'emerald' | 'rose' | 'amber' }) {
  const cm = { primary: 'bg-primary/10 text-primary', emerald: 'bg-emerald-500/10 text-emerald-600', rose: 'bg-rose-500/10 text-rose-600', amber: 'bg-amber-500/10 text-amber-600' }
  return <Card><CardContent className="p-3 flex items-center gap-2"><div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cm[c]}`}><Icon className="w-4 h-4" /></div><div className="min-w-0"><p className="text-base sm:text-lg font-bold truncate">{value}</p><p className="text-[10px] text-muted-foreground truncate">{label}</p></div></CardContent></Card>
}
