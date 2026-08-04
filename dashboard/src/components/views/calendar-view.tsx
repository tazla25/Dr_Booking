// /home/z/my-project/src/components/views/calendar-view.tsx
// Calendar View — monthly appointment calendar with day details.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  XCircle,
  UserX,
  Users,
  CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface CalendarDay {
  date: string
  count: number
  completed: number
  confirmed: number
  cancelled: number
  noShow: number
  pending: number
}

interface CalendarData {
  year: number
  month: number
  days: CalendarDay[]
  doctors: Array<{ id: string; fullName: string; specialization: string }>
  summary: {
    totalAppointments: number
    totalCompleted: number
    totalConfirmed: number
    totalCancelled: number
    totalNoShow: number
    busyDays: number
  }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView() {
  const { t, user } = useApp()
  const router = useRouter()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-indexed
  const [doctorId, setDoctorId] = useState<string>('all')
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('year', String(year))
      params.set('month', String(month))
      if (doctorId !== 'all') params.set('doctorId', doctorId)
      const d = await api<CalendarData>(`/api/appointments/calendar?${params.toString()}`)
      setData(d)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [year, month, doctorId])

  useEffect(() => {
    fetch()
  }, [fetch])

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  const goToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
  }

  // Build calendar grid (with leading/trailing empty cells)
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const calendarCells: Array<CalendarDay | null> = []
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayData = data?.days.find((day) => day.date === dateStr)
    calendarCells.push(dayData || { date: dateStr, count: 0, completed: 0, confirmed: 0, cancelled: 0, noShow: 0, pending: 0 })
  }

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" />
            Appointment Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly view of all appointments across your practice
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSuperAdmin && data && data.doctors.length > 0 && (
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All doctors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Doctors</SelectItem>
                {data.doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fullName} · {d.specialization}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={goToday} className="gap-1.5">
            <CalendarIcon className="w-4 h-4" />
            Today
          </Button>
        </div>
      </div>

      {/* Month navigation + summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-9 w-9">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-bold text-foreground">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-9 w-9">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {/* Summary stats */}
              {data && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                  <SummaryStat icon={Users} label="Total" value={data.summary.totalAppointments} color="primary" />
                  <SummaryStat icon={Clock} label="Confirmed" value={data.summary.totalConfirmed} color="amber" />
                  <SummaryStat icon={CheckCircle2} label="Completed" value={data.summary.totalCompleted} color="emerald" />
                  <SummaryStat icon={XCircle} label="Cancelled" value={data.summary.totalCancelled} color="rose" />
                  <SummaryStat icon={UserX} label="No-show" value={data.summary.totalNoShow} color="zinc" />
                  <SummaryStat icon={CalendarDays} label="Busy Days" value={data.summary.busyDays} color="primary" />
                </div>
              )}

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {/* Day headers */}
                {DAY_NAMES.map((day) => (
                  <div key={day} className="text-center text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
                    {day}
                  </div>
                ))}

                {/* Day cells */}
                {calendarCells.map((cell, idx) => {
                  if (!cell) return <div key={`empty-${idx}`} className="min-h-[70px] sm:min-h-[90px]" />

                  const dayNum = parseInt(cell.date.split('-')[2], 10)
                  const isToday = cell.date === todayStr
                  const isFuture = cell.date > todayStr
                  const hasAppointments = cell.count > 0

                  return (
                    <button
                      key={cell.date}
                      onClick={() => setSelectedDay(cell)}
                      className={`
                        min-h-[70px] sm:min-h-[90px] rounded-lg border p-1.5 sm:p-2 text-left transition-all hover:shadow-md hover:scale-[1.02]
                        ${isToday ? 'border-primary border-2 bg-primary/5' : 'border-border bg-card hover:border-primary/30'}
                        ${hasAppointments ? 'cursor-pointer' : 'opacity-60'}
                        ${isFuture && !hasAppointments ? 'bg-muted/20' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`
                          text-xs sm:text-sm font-semibold
                          ${isToday ? 'text-primary' : 'text-foreground'}
                        `}>
                          {dayNum}
                        </span>
                        {hasAppointments && (
                          <span className="text-[9px] sm:text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                            {cell.count}
                          </span>
                        )}
                      </div>
                      {hasAppointments && (
                        <div className="space-y-0.5">
                          {cell.completed > 0 && (
                            <div className="flex items-center gap-1 text-[9px] sm:text-[10px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span className="text-muted-foreground">{cell.completed} done</span>
                            </div>
                          )}
                          {cell.confirmed > 0 && (
                            <div className="flex items-center gap-1 text-[9px] sm:text-[10px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span className="text-muted-foreground">{cell.confirmed} wait</span>
                            </div>
                          )}
                          {cell.cancelled > 0 && (
                            <div className="flex items-center gap-1 text-[9px] sm:text-[10px]">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              <span className="text-muted-foreground">{cell.cancelled} cancel</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">Legend:</span>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Completed</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Confirmed/Waiting</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-muted-foreground">Cancelled</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                  <span className="text-muted-foreground">No-show</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs ml-auto">
                  <div className="w-3 h-3 rounded border-2 border-primary" />
                  <span className="text-muted-foreground">Today</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {selectedDay.count} {selectedDay.count === 1 ? 'appointment' : 'appointments'} on this day
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  router.push(`/?view=appointments&date=${selectedDay.date}`)
                  setSelectedDay(null)
                }}
                className="gap-1.5"
              >
                View Full List
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedDay.count === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No appointments on this day.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <DayStat icon={Users} label="Total" value={selectedDay.count} color="primary" />
                <DayStat icon={CheckCircle2} label="Completed" value={selectedDay.completed} color="emerald" />
                <DayStat icon={Clock} label="Confirmed" value={selectedDay.confirmed} color="amber" />
                <DayStat icon={XCircle} label="Cancelled" value={selectedDay.cancelled} color="rose" />
                <DayStat icon={UserX} label="No-show" value={selectedDay.noShow} color="zinc" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryStat({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: 'primary' | 'emerald' | 'amber' | 'rose' | 'zinc' }) {
  const cm = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    zinc: 'bg-zinc-400/10 text-zinc-600 dark:text-zinc-400',
  }
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cm[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight">{value}</p>
        <p className="text-[9px] text-muted-foreground truncate uppercase tracking-wider">{label}</p>
      </div>
    </div>
  )
}

function DayStat({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: 'primary' | 'emerald' | 'amber' | 'rose' | 'zinc' }) {
  const cm = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    zinc: 'bg-zinc-400/10 text-zinc-600 dark:text-zinc-400',
  }
  return (
    <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cm[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  )
}
