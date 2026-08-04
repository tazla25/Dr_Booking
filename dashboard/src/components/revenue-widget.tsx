// /home/z/my-project/src/components/revenue-widget.tsx
// Revenue widget — shows actual revenue from completed appointments.
// Displays today's revenue, total revenue, growth rate, and a mini chart.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Skeleton } from './ui/skeleton'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { TrendingUp, TrendingDown, IndianRupee, Calendar, Users, BarChart3, ArrowRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useRouter } from 'next/navigation'

interface RevenueData {
  summary: {
    totalRevenue: number
    todayRevenue: number
    totalCompleted: number
    todayCompleted: number
    uniquePatients: number
    avgRevenuePerAppt: number
    growthRate: number
    thisWeekRevenue: number
    lastWeekRevenue: number
  }
  daily: Array<{ date: string; revenue: number; count: number }>
  byDoctor: Array<{ doctorId: string; fullName: string; specialization: string; revenue: number; count: number }>
}

export function RevenueWidget({ days = 30 }: { days?: number }) {
  const router = useRouter()
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      const d = await api<RevenueData>(`/api/analytics/revenue?days=${days}`)
      setData(d)
    } catch {
      // ignore — revenue is non-critical
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetch()
  }, [fetch])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data || data.summary.totalCompleted === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <IndianRupee className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">No revenue data yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Revenue will appear here once appointments are completed.
          </p>
        </CardContent>
      </Card>
    )
  }

  const s = data.summary
  const isGrowth = s.growthRate >= 0
  const formatRevenue = (v: number) => `₹${v.toLocaleString('en-IN')}`

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-600" />
              Revenue Overview
            </CardTitle>
            <CardDescription className="text-xs">Last {days} days · from completed appointments</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => router.push('/?view=analytics')}
          >
            Details
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main revenue display */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 border border-emerald-500/20">
            <div className="flex items-center gap-1.5 mb-1">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
              <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium">Total Revenue</p>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatRevenue(s.totalRevenue)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.totalCompleted} completed appointments</p>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 border border-primary/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] uppercase tracking-wider text-primary font-medium">Today's Revenue</p>
            </div>
            <p className="text-2xl font-bold text-primary">{formatRevenue(s.todayRevenue)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.todayCompleted} completed today</p>
          </div>
        </div>

        {/* Growth + stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <p className="text-sm font-bold text-foreground">{formatRevenue(s.avgRevenuePerAppt)}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg / Appt</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <p className="text-sm font-bold text-foreground">{s.uniquePatients}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Paying Patients</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/40">
            <div className="flex items-center justify-center gap-0.5">
              {isGrowth ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              )}
              <p className={`text-sm font-bold ${isGrowth ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {isGrowth ? '+' : ''}{s.growthRate}%
              </p>
            </div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">WoW Growth</p>
          </div>
        </div>

        {/* Mini revenue chart */}
        {data.daily.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              Daily Revenue Trend
            </p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(5)}
                    tick={{ fontSize: 9, fill: 'oklch(0.5 0.015 160)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'oklch(0.5 0.015 160)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'oklch(0.21 0.015 165)',
                      border: '1px solid oklch(1 0 0 / 10%)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: 'oklch(0.97 0.005 145)',
                    }}
                    formatter={(value: number) => [formatRevenue(value), 'Revenue']}
                    labelStyle={{ color: 'oklch(0.7 0.015 160)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#revGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top earning doctors */}
        {data.byDoctor.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Top Earning Doctors</p>
            <div className="space-y-1.5">
              {data.byDoctor.slice(0, 3).map((d, i) => (
                <div key={d.doctorId} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                    : i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{d.fullName}</p>
                    <p className="text-[10px] text-muted-foreground">{d.count} appts · {d.specialization}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatRevenue(d.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
