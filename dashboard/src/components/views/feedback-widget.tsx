// /home/z/my-project/src/components/views/feedback-widget.tsx
//
// Phase 1 reform (Task 2.1): NPS + average rating widget for the analytics view.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Star, MessageSquareQuote, ThumbsUp, ThumbsDown, Meh } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface FeedbackEntry {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  appointment: {
    patientName: string
    appointmentDate: string
    doctor: { id: string; fullName: string; specialization: string }
  }
}

interface FeedbackStats {
  total: number
  averageRating: number
  ratingCounts: Record<number, number>
  promoters: number
  passives: number
  detractors: number
  nps: number
}

interface Props {
  days: number
}

const RATING_COLORS: Record<number, string> = {
  1: '#dc2626',
  2: '#ea580c',
  3: '#ca8a04',
  4: '#16a34a',
  5: '#15803d',
}

export function FeedbackWidget({ days }: Props) {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ feedback: FeedbackEntry[]; stats: FeedbackStats }>(
        `/api/feedback?days=${days}&limit=20`
      )
      setFeedback(data.feedback)
      setStats(data.stats)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetch()
  }, [fetch])

  const ratingDistribution = stats
    ? [1, 2, 3, 4, 5].map((r) => ({ rating: `${r}★`, count: stats.ratingCounts[r] || 0, stars: r }))
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="w-4 h-4 text-amber-500" />
          Patient Feedback (NPS)
        </CardTitle>
        <CardDescription>
          Last {days} days · {stats?.total || 0} responses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !stats || stats.total === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <MessageSquareQuote className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No feedback collected yet. Patients will be asked to rate their visit 2 hours after
            their appointment is marked completed.
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Avg Rating</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {stats.averageRating.toFixed(1)}★
                </p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" /> Promoters
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {stats.promoters}
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Meh className="w-3 h-3" /> Passives
                </p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  {stats.passives}
                </p>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" /> Detractors
                </p>
                <p className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                  {stats.detractors}
                </p>
              </div>
            </div>

            {/* NPS score */}
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">NPS Score</p>
                <p className={`text-4xl font-bold ${stats.nps >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stats.nps > 0 ? '+' : ''}{stats.nps}
                </p>
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                NPS = % promoters − % detractors. Range: −100 to +100.
                {stats.nps >= 50 ? ' Excellent — patients love the service!' : stats.nps >= 0 ? ' Good — room to improve.' : ' Needs attention — gather more feedback.'}
              </p>
            </div>

            {/* Rating distribution chart */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Rating Distribution</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {ratingDistribution.map((entry) => (
                        <Cell key={entry.stars} fill={RATING_COLORS[entry.stars]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent comments */}
            {feedback.filter((f) => f.comment).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Recent Comments</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {feedback
                    .filter((f) => f.comment)
                    .slice(0, 5)
                    .map((f) => (
                      <div key={f.id} className="bg-muted/40 rounded-md p-2 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {f.rating}★
                          </Badge>
                          <span className="font-medium">{f.appointment.patientName}</span>
                          <span className="text-muted-foreground">· {f.appointment.doctor.fullName}</span>
                          <span className="text-muted-foreground ml-auto">
                            {new Date(f.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-foreground/80">{f.comment}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
