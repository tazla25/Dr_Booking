// /home/z/my-project/src/components/views/tracker-view.tsx
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApp } from '../providers'
import { useTheme } from '../theme-provider'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Card, CardContent } from '../ui/card'
import { Activity, Sun, Moon, Volume2, VolumeX, ArrowLeft, RefreshCw, Clock, UserCheck, Users } from 'lucide-react'
import { toast } from 'sonner'

interface Schedule {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  clinicName: string | null
  doctor: { fullName: string; specialization: string } | null
}

interface QueueData {
  schedule: {
    dayOfWeek: string
    startTime: string
    endTime: string
    clinicName: string | null
    clinicAddress: string | null
    avgMinutesPerPatient: number
    doctor: { fullName: string; specialization: string } | null
  }
  currentToken: number
  estimatedWaitMinutes: number
  pendingCount: number
  completedCount: number
  cancelledCount: number
  totalCount: number
  pending: Array<{ queueNumber: number; patientName: string; status: string }>
}

export function TrackerView() {
  const { t, lang, setLang } = useApp()
  const { theme, toggle } = useTheme()
  const search = useSearchParams()
  const [scheduleId, setScheduleId] = useState<string>(search.get('scheduleId') || '')
  const [date, setDate] = useState<string>(search.get('date') || new Date().toISOString().split('T')[0])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(false)
  const prevToken = useRef<number>(-1)
  const audioRef = useRef<AudioContext | null>(null)

  // Fetch available schedules (public — no auth)
  useEffect(() => {
    fetch('/api/public/schedules', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (d.schedules) {
          setSchedules(d.schedules)
          // Auto-pick first if none specified
          if (!scheduleId && d.schedules.length > 0) {
            setScheduleId(d.schedules[0].id)
          }
        }
      })
      .catch(() => setError(t('errorLoading')))
  }, [scheduleId, t])

  const playChime = useCallback(() => {
    if (!soundOn) return
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      const ctx = audioRef.current
      const now = ctx.currentTime
      // Two-tone chime
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.frequency.value = 880
      osc1.type = 'sine'
      gain1.gain.setValueAtTime(0, now)
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.02)
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
      osc1.connect(gain1).connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.4)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.frequency.value = 1320
      osc2.type = 'sine'
      gain2.gain.setValueAtTime(0, now + 0.2)
      gain2.gain.linearRampToValueAtTime(0.15, now + 0.22)
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6)
      osc2.connect(gain2).connect(ctx.destination)
      osc2.start(now + 0.2)
      osc2.stop(now + 0.6)
    } catch (e) {
      console.warn('Audio failed', e)
    }
  }, [soundOn])

  const [isOffline, setIsOffline] = useState(false)

  const refresh = useCallback(async () => {
    if (!scheduleId) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/queue/${scheduleId}/${date}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d: QueueData = await res.json()
      setData(d)
      setError(null)
      setIsOffline(false)

      try {
        localStorage.setItem(`tracker_${scheduleId}_${date}`, JSON.stringify(d))
      } catch (e) {
        console.warn('Could not cache tracker data', e)
      }

      // Sound on token change
      if (prevToken.current !== -1 && d.currentToken > prevToken.current) {
        playChime()
      }
      prevToken.current = d.currentToken
    } catch {
      try {
        const cached = localStorage.getItem(`tracker_${scheduleId}_${date}`)
        if (cached) {
          setData(JSON.parse(cached))
          setIsOffline(true)
          setError(null)
        } else {
          setError(t('errorLoading'))
        }
      } catch (e) {
        setError(t('errorLoading'))
      }
    } finally {
      setLoading(false)
    }
  }, [scheduleId, date, t, playChime])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('backToDashboard')}
          </a>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
              className="gap-1 h-8 px-2"
            >
              <span className="text-xs font-semibold uppercase">{lang}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={toggle} className="h-8 w-8 p-0" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSoundOn(!soundOn)}
              className="h-8 w-8 p-0"
              aria-label={soundOn ? t('disableSound') : t('enableSound')}
            >
              {soundOn ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden shadow-xl">
          {/* Header */}
          <div className={`p-6 text-center text-primary-foreground ${isOffline ? 'bg-amber-600' : 'bg-gradient-to-br from-primary to-primary/80'}`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <Activity className="w-5 h-5" />
              <h1 className="text-lg font-bold">{t('liveQueueTracker')}</h1>
            </div>
            <p className="text-xs text-primary-foreground/90 flex items-center justify-center gap-1">
              {isOffline ? (
                <>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-300" />
                  Offline - Showing cached queue status
                </>
              ) : (
                <>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  {t('updatesEvery15s')}
                </>
              )}
            </p>
          </div>

          <CardContent className="p-6 space-y-4">
            {/* Schedule picker */}
            <div className="space-y-2">
              <Select value={scheduleId} onValueChange={(v) => { setScheduleId(v); setLoading(true); prevToken.current = -1 }}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t('selectSchedule')} />
                </SelectTrigger>
                <SelectContent>
                  {schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.doctor?.fullName} · {s.dayOfWeek} {s.startTime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading && !data ? (
              <div className="py-10 text-center text-muted-foreground text-sm">{t('loadingData')}</div>
            ) : error ? (
              <div className="py-10 text-center text-rose-600 text-sm">{error}</div>
            ) : data ? (
              <>
                {/* Doctor / clinic info */}
                <div className="text-center border-b border-border pb-4">
                  <h2 className="font-semibold text-foreground">{data.schedule.doctor?.fullName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {data.schedule.doctor?.specialization} · {data.schedule.clinicName || 'Clinic'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    {data.schedule.startTime} – {data.schedule.endTime}
                  </p>
                </div>

                {/* Current token — huge */}
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('currentToken')}</p>
                  <p className="text-7xl font-black text-primary leading-none my-2 tabular-nums">
                    {String(data.currentToken).padStart(2, '0')}
                  </p>
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                      {data.completedCount} {t('completed').toLowerCase()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-amber-500" />
                      {data.pendingCount} {t('waiting').toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Estimated wait */}
                {data.pendingCount > 0 && (
                  <div className="bg-accent/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t('avgWaitTime')}</p>
                    <p className="text-lg font-bold text-foreground">
                      ~{data.estimatedWaitMinutes} {t('minutes')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {data.pendingCount} {t('patientsAhead')} · {data.schedule.avgMinutesPerPatient} {t('minutes')}/{t('patient').toLowerCase()}
                    </p>
                  </div>
                )}

                {/* Pending list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('pendingPatients')}
                    </p>
                    <Button size="sm" variant="ghost" onClick={refresh} className="h-7 w-7 p-0">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {data.pending.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">{t('noPatientsWaiting')}</p>
                    ) : (
                      data.pending.slice(0, 12).map((p) => (
                        <div
                          key={p.queueNumber}
                          className="flex items-center justify-between bg-accent/30 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm font-medium text-foreground truncate">
                            {p.patientName}
                          </span>
                          <span className="ml-2 flex-shrink-0 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                            #{p.queueNumber}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
                  {t('lastUpdated')}: {new Date().toLocaleTimeString(lang === 'bn' ? 'bn-IN' : 'en-IN')}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground mt-4">
          {t('appName')} · {t('reformEdition')}
        </p>
      </div>
    </div>
  )
}
