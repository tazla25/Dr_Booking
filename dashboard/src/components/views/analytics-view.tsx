// /home/z/my-project/src/components/views/analytics-view.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Button } from '../ui/button'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Users, CheckCircle2, UserX, TrendingUp, BarChart3, Star, AlertCircle } from 'lucide-react'
import { FeedbackWidget } from './feedback-widget'

interface AnalyticsData {
  kpis: {
    total: number
    completed: number
    noShow: number
    cancelled: number
    confirmed: number
    noShowRate: number
    completionRate: number
  }
  daily: Array<{ date: string; total: number; completed: number; cancelled: number; noShow: number }>
  statusBreakdown: Array<{ status: string; count: number }>
  byDoctor: Array<{ doctorId: string; fullName: string; specialization: string; count: number }>
  byDayOfWeek: Array<{ day: string; count: number }>
}

const STATUS_COLORS: Record<string, string> = {
  Confirmed: 'oklch(0.7 0.13 200)',
  Completed: 'oklch(0.62 0.13 165)',
  Cancelled: 'oklch(0.65 0.2 25)',
  NoShow: 'oklch(0.5 0.015 160)',
  Pending: 'oklch(0.78 0.15 85)',
}

export function AnalyticsView() {
  const { t, lang } = useApp()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  // IMP-006 fix: surface a real error state instead of swallowing the
  // error and leaving the user staring at an infinite skeleton.
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api<AnalyticsData>(`/api/analytics?days=${days}`)
      setData(d)
    } catch (e) {
      setData(null)
      setError((e as Error)?.message || 'Failed to load analytics. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetch()
  }, [fetch])

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('analyticsOverview')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('analytics')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={days === 7 ? 'default' : 'outline'}
            onClick={() => setDays(7)}
          >
            {t('last7Days')}
          </Button>
          <Button
            size="sm"
            variant={days === 30 ? 'default' : 'outline'}
            onClick={() => setDays(30)}
          >
            {t('last30Days')}
          </Button>
        </div>
      </div>

      {loading || (!data && !error) ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-80 rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : error ? (
        // IMP-006 fix: show a real error card with a retry button instead of
        // staying on the skeleton forever when the API call fails.
        <Card className="border-dashed border-rose-200 dark:border-rose-900">
          <CardContent className="p-12 text-center space-y-3">
            <AlertCircle className="w-12 h-12 mx-auto text-rose-500 mb-2" />
            <h3 className="text-lg font-semibold">{t('error')}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
            <Button onClick={fetch} variant="outline" size="sm" className="mt-2">
              {t('refresh')}
            </Button>
          </CardContent>
        </Card>
      ) : data && data.kpis.total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('noAnalyticsData')}</p>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Users} label={t('totalPatients')} value={data.kpis.total} color="primary" />
            <KpiCard icon={CheckCircle2} label={t('completed')} value={data.kpis.completed} sub={`${data.kpis.completionRate}%`} color="emerald" />
            <KpiCard icon={UserX} label={t('noShow')} value={data.kpis.noShow} sub={`${data.kpis.noShowRate}%`} color="rose" />
            <KpiCard icon={TrendingUp} label={t('waiting')} value={data.kpis.confirmed} color="amber" />
          </div>

          {/* Daily appointments line chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dailyAppointments')}</CardTitle>
              <CardDescription className="text-xs">{t('last30Days')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 145)" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => v.slice(5)}
                      tick={{ fontSize: 11, fill: 'oklch(0.5 0.015 160)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'oklch(0.91 0.01 145)' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'oklch(0.5 0.015 160)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'oklch(0.21 0.015 165)',
                        border: '1px solid oklch(1 0 0 / 10%)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'oklch(0.97 0.005 145)',
                      }}
                      labelStyle={{ color: 'oklch(0.7 0.015 160)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="total" stroke="oklch(0.55 0.13 165)" strokeWidth={2} dot={{ r: 3 }} name={t('totalPatients')} />
                    <Line type="monotone" dataKey="completed" stroke="oklch(0.62 0.13 165)" strokeWidth={2} dot={false} name={t('completed')} />
                    <Line type="monotone" dataKey="noShow" stroke="oklch(0.65 0.2 25)" strokeWidth={2} dot={false} name={t('noShow')} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Status breakdown pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('statusBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.statusBreakdown}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={2}
                        label={(entry) => `${entry.count}`}
                      >
                        {data.statusBreakdown.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || 'oklch(0.5 0.015 160)'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'oklch(0.21 0.015 165)',
                          border: '1px solid oklch(1 0 0 / 10%)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'oklch(0.97 0.005 145)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* By doctor bar chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('appointmentsByDoctor')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byDoctor} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 145)" strokeOpacity={0.5} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: 'oklch(0.5 0.015 160)' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="fullName"
                        tick={{ fontSize: 11, fill: 'oklch(0.5 0.015 160)' }}
                        tickLine={false}
                        axisLine={false}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'oklch(0.21 0.015 165)',
                          border: '1px solid oklch(1 0 0 / 10%)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'oklch(0.97 0.005 145)',
                        }}
                        cursor={{ fill: 'oklch(0.94 0.04 165 / 0.5)' }}
                      />
                      <Bar dataKey="count" fill="oklch(0.55 0.13 165)" radius={[0, 4, 4, 0]} name={t('totalPatients')} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Day of week */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('appointmentsByDay')}</CardTitle>
              <CardDescription className="text-xs">{t('peakHours')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byDayOfWeek} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 145)" strokeOpacity={0.5} vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: 'oklch(0.5 0.015 160)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'oklch(0.91 0.01 145)' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'oklch(0.5 0.015 160)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'oklch(0.21 0.015 165)',
                        border: '1px solid oklch(1 0 0 / 10%)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'oklch(0.97 0.005 145)',
                      }}
                      cursor={{ fill: 'oklch(0.94 0.04 165 / 0.5)' }}
                    />
                    <Bar dataKey="count" fill="oklch(0.7 0.13 200)" radius={[4, 4, 0, 0]} name={t('totalPatients')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Patient Feedback / NPS widget (Task 2.1) */}
      <FeedbackWidget days={days} />
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: typeof Users
  label: string
  value: number
  color: 'primary' | 'emerald' | 'rose' | 'amber'
  sub?: string
}) {
  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  }
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/70 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
