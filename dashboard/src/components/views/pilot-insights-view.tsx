// /home/z/my-project/src/components/views/pilot-insights-view.tsx (Task 4.1)
'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api-client'
// @ts-ignore
import { useQuery, useAction } from 'wasp/client/operations'
import { useApp } from '../providers'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Stethoscope, Calendar, Users, Star, Clock, Download, ShieldCheck, TrendingUp, Activity } from 'lucide-react'
import { toast } from 'sonner'

interface PilotData {
  doctors: { total: number; active: number; pendingVerification: number; newThisWeek: number }
  appointments: { total: number; onlineBookings: number; walkInBookings: number; completed: number; noShow: number; cancelled: number; confirmed: number; completedRate: number; noShowRate: number; cancellationRate: number }
  patients: { total: number; returningRate: number; averageBookingsPerPatient: number }
  feedback: { averageRating: number; totalResponses: number; responseRate: number }
  timeSaved: { estimatedMinutesPerPatient: number; totalMinutesSaved: number }
  daily: Array<{ date: string; count: number }>
  onlineVsWalkIn: Array<{ name: string; count: number }>
  doctorLeaderboard: Array<{ doctorId: string; fullName: string; specialization: string; count: number }>
}
const COLORS = ['#3b82f6', '#f59e0b']

export function PilotInsightsView() {
  const { user } = useApp()
  const [data, setData] = useState<PilotData | null>(null)
  const [loading, setLoading] = useState(true)
  const fetch = useCallback(async () => {
    setLoading(true)
    try { const d = await api<PilotData>('/api/analytics/pilot'); setData(d) }
    catch (e) { toast.error((e as Error).message || 'Failed to load') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (user?.role === 'SUPER_ADMIN') fetch() }, [user, fetch])
  if (user?.role !== 'SUPER_ADMIN') return (<div className="max-w-3xl mx-auto"><Card><CardContent className="p-8 text-center"><ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><h2 className="text-lg font-semibold">Access restricted</h2><p className="text-sm text-muted-foreground mt-1">Super admin only.</p></CardContent></Card></div>)
  const exportCsv = () => {
    if (!data) return
    const rows = [['Metric', 'Value'], ['Doctors total', data.doctors.total], ['Doctors active', data.doctors.active], ['Pending verification', data.doctors.pendingVerification], ['Appointments total', data.appointments.total], ['Online bookings', data.appointments.onlineBookings], ['Walk-in bookings', data.appointments.walkInBookings], ['Completed', data.appointments.completed], ['No-show', data.appointments.noShow], ['Cancelled', data.appointments.cancelled], ['Avg rating', data.feedback.averageRating], ['Total minutes saved', data.timeSaved.totalMinutesSaved]]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `pilot-insights-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }
  if (loading || !data) return (<div className="space-y-6 max-w-7xl mx-auto"><Skeleton className="h-10 w-72" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div>)
  const hours = Math.floor(data.timeSaved.totalMinutesSaved / 60), mins = data.timeSaved.totalMinutesSaved % 60
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-primary" />Pilot Insights</h1><p className="text-muted-foreground text-sm mt-1">KPIs and time-saved metrics.</p></div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2 self-start"><Download className="w-4 h-4" />Export CSV</Button>
      </div>
      <Card className="bg-gradient-to-br from-emerald-500/10 to-primary/10 border-emerald-500/20">
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0"><Clock className="w-7 h-7 text-emerald-600" /></div>
          <div className="flex-1"><p className="text-sm font-medium text-muted-foreground">সর্বমোট সময় বাঁচানো হয়েছে · Total Time Saved</p><p className="text-3xl sm:text-4xl font-bold text-emerald-700">{hours} ঘণ্টা {mins} মিনিট</p><p className="text-xs text-muted-foreground mt-1">~{data.timeSaved.estimatedMinutesPerPatient} min saved per completed appointment × {data.appointments.completed} completed</p></div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Stethoscope} label="Active Doctors" value={data.doctors.active} sub={`${data.doctors.pendingVerification} pending`} color="primary" />
        <KpiCard icon={Calendar} label="Total Appointments" value={data.appointments.total} sub={`${data.appointments.onlineBookings} online · ${data.appointments.walkInBookings} walk-in`} color="amber" />
        <KpiCard icon={Users} label="Patient Return Rate" value={`${data.patients.returningRate}%`} sub={`${data.patients.total} unique`} color="emerald" />
        <KpiCard icon={Star} label="Avg Rating" value={`${data.feedback.averageRating}★`} sub={`${data.feedback.totalResponses} responses`} color="amber" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Daily Bookings (14 days)</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />Online vs Walk-in</CardTitle></CardHeader><CardContent><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.onlineVsWalkIn}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" radius={[4,4,0,0]}>{data.onlineVsWalkIn.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" />Doctor Leaderboard</CardTitle><CardDescription>Top 5 by appointment count</CardDescription></CardHeader><CardContent>{data.doctorLeaderboard.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p> : <div className="space-y-2">{data.doctorLeaderboard.map((d, i) => (<div key={d.doctorId} className="flex items-center gap-3 p-2 rounded-md bg-muted/40"><span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-800' : i === 1 ? 'bg-slate-100 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-800' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span><div className="flex-1 min-w-0"><p className="font-medium truncate">{d.fullName}</p><p className="text-xs text-muted-foreground">{d.specialization}</p></div><span className="font-bold text-primary">{d.count}</span></div>))}</div>}</CardContent></Card>
    </div>
  )
}
function KpiCard({ icon: Icon, label, value, sub, color }: { icon: typeof Users; label: string; value: string | number; sub?: string; color: 'primary' | 'emerald' | 'amber' }) {
  const cm = { primary: 'bg-primary/10 text-primary', emerald: 'bg-emerald-500/10 text-emerald-600', amber: 'bg-amber-500/10 text-amber-600' }
  return <Card><CardContent className="p-4 sm:p-5 flex items-center gap-3"><div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cm[color]}`}><Icon className="w-5 h-5" /></div><div className="min-w-0"><p className="text-xl sm:text-2xl font-bold leading-tight">{value}</p><p className="text-xs text-muted-foreground truncate">{label}</p>{sub && <p className="text-[10px] text-muted-foreground/70 truncate">{sub}</p>}</div></CardContent></Card>
}
