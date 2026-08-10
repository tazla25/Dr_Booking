// /home/z/my-project/src/components/views/feedback-widget.tsx (Task 2.1)
'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api-client'
// @ts-ignore
import { useQuery, useAction } from 'wasp/client/operations'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Star, MessageSquareQuote, ThumbsUp, ThumbsDown, Meh } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface FeedbackEntry { id: string; rating: number; comment: string | null; createdAt: string; appointment: { patientName: string; appointmentDate: string; doctor: { id: string; fullName: string; specialization: string } } }
interface Stats { total: number; averageRating: number; ratingCounts: Record<number, number>; promoters: number; passives: number; detractors: number; nps: number }
const RC: Record<number, string> = { 1: '#dc2626', 2: '#ea580c', 3: '#ca8a04', 4: '#16a34a', 5: '#15803d' }

export function FeedbackWidget({ days }: { days: number }) {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const fetch = useCallback(async () => {
    setLoading(true)
    try { const d = await api<{ feedback: FeedbackEntry[]; stats: Stats }>(`/api/feedback?days=${days}&limit=20`); setFeedback(d.feedback); setStats(d.stats) }
    catch { /* ignore */ }
    finally { setLoading(false) }
  }, [days])
  useEffect(() => { fetch() }, [fetch])
  const dist = stats ? [1,2,3,4,5].map(r => ({ rating: `${r}★`, count: stats.ratingCounts[r] || 0, stars: r })) : []
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Star className="w-4 h-4 text-amber-500" />Patient Feedback (NPS)</CardTitle><CardDescription>Last {days} days · {stats?.total || 0} responses</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        {loading ? <Skeleton className="h-40 w-full" /> : !stats || stats.total === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground"><MessageSquareQuote className="w-8 h-8 mx-auto mb-2 opacity-40" />No feedback collected yet. Patients will be asked to rate their visit 2 hours after completion.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3"><p className="text-xs text-muted-foreground">Avg Rating</p><p className="text-2xl font-bold text-amber-700">{stats.averageRating.toFixed(1)}★</p></div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" />Promoters</p><p className="text-2xl font-bold text-emerald-700">{stats.promoters}</p></div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><Meh className="w-3 h-3" />Passives</p><p className="text-2xl font-bold text-blue-700">{stats.passives}</p></div>
              <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><ThumbsDown className="w-3 h-3" />Detractors</p><p className="text-2xl font-bold text-rose-700">{stats.detractors}</p></div>
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 flex items-center gap-4">
              <div><p className="text-xs text-muted-foreground">NPS Score</p><p className={`text-4xl font-bold ${stats.nps >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stats.nps > 0 ? '+' : ''}{stats.nps}</p></div>
              <p className="text-xs text-muted-foreground flex-1">NPS = % promoters − % detractors. Range: −100 to +100. {stats.nps >= 50 ? 'Excellent!' : stats.nps >= 0 ? 'Good.' : 'Needs attention.'}</p>
            </div>
            <div><p className="text-xs text-muted-foreground mb-2">Rating Distribution</p><div className="h-32"><ResponsiveContainer width="100%" height="100%"><BarChart data={dist}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="rating" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" radius={[4,4,0,0]}>{dist.map(e => <Cell key={e.stars} fill={RC[e.stars]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
            {feedback.filter(f => f.comment).length > 0 && (<div><p className="text-xs text-muted-foreground mb-2">Recent Comments</p><div className="space-y-2 max-h-48 overflow-y-auto">{feedback.filter(f => f.comment).slice(0, 5).map(f => (<div key={f.id} className="bg-muted/40 rounded-md p-2 text-xs"><div className="flex items-center gap-2 mb-1"><Badge variant="secondary" className="text-[10px]">{f.rating}★</Badge><span className="font-medium">{f.appointment.patientName}</span><span className="text-muted-foreground">· {f.appointment.doctor.fullName}</span></div><p className="text-foreground/80">{f.comment}</p></div>))}</div></div>)}
          </>
        )}
      </CardContent>
    </Card>
  )
}
