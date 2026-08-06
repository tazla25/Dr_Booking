// /home/z/my-project/src/components/notification-bell.tsx
// Notification bell icon with dropdown panel — shows recent activity alerts.
// Read state is persisted in localStorage so the badge only shows truly new items.
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api-client'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  Star,
  ShieldCheck,
  Zap,
  XCircle,
  ChevronRight,
  CheckCheck,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
  actionUrl?: string
  read: boolean
}

interface NotificationData {
  notifications: Notification[]
  unreadCount: number
  total: number
}

const READ_KEY = 'drb_notif_read'
const READ_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days — old read IDs expire

/** Load the set of read notification IDs from localStorage (with TTL cleanup). */
function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as { ids: string[]; ts: number }
    const now = Date.now()
    if (now - parsed.ts > READ_TTL) {
      // Expired — clear and return empty
      localStorage.removeItem(READ_KEY)
      return new Set()
    }
    return new Set(parsed.ids)
  } catch {
    return new Set()
  }
}

/** Save read IDs to localStorage. */
function saveReadIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(READ_KEY, JSON.stringify({ ids: Array.from(ids), ts: Date.now() }))
  } catch {
    // ignore quota errors
  }
}

export function NotificationBell() {
  const router = useRouter()
  const [data, setData] = useState<NotificationData | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<NotificationData>('/api/notifications')
      setData(d)
    } catch {
      // ignore — notifications are non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  // Load read IDs from localStorage on mount
  useEffect(() => {
    setReadIds(loadReadIds())
  }, [])

  // Initial fetch + polling every 30 seconds.
  // BUG-015 fix: previously the bell only fetched on mount, so notifications
  // were stale until the user refreshed the page. Polling at 30s is a
  // pragmatic trade-off (WebSocket/SSE would be heavier infra). The manual
  // Refresh button at the bottom of the panel still triggers an immediate
  // fetch on demand.
  useEffect(() => {
    fetchNotifications()
    pollRef.current = setInterval(fetchNotifications, 30000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchNotifications])

  // Compute unread count based on readIds
  const unreadCount = data
    ? data.notifications.filter((n) => !readIds.has(n.id)).length
    : 0

  const markAllAsRead = useCallback(() => {
    if (!data) return
    const newReadIds = new Set(readIds)
    for (const n of data.notifications) {
      newReadIds.add(n.id)
    }
    setReadIds(newReadIds)
    saveReadIds(newReadIds)
  }, [data, readIds])

  const handleNotificationClick = (notif: Notification) => {
    // Mark as read
    const newReadIds = new Set(readIds)
    newReadIds.add(notif.id)
    setReadIds(newReadIds)
    saveReadIds(newReadIds)

    if (notif.actionUrl) {
      router.push(notif.actionUrl)
    }
    setOpen(false)
  }

  const getIcon = (type: string, severity: string) => {
    if (type === 'pending_verification') return ShieldCheck
    if (type === 'feedback_received') return Star
    if (type === 'high_no_show') return AlertTriangle
    if (type === 'appointment_completed') return CheckCircle2
    if (type === 'new_booking' && severity === 'info') return Zap
    if (severity === 'error') return XCircle
    if (severity === 'warning') return AlertTriangle
    if (severity === 'success') return CheckCircle2
    return Info
  }

  const getSeverityColor = (severity: string) => {
    const map: Record<string, string> = {
      info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      error: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    }
    return map[severity] || map.info
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[9px] font-bold text-white bg-rose-500 rounded-full ring-2 ring-background animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 sm:w-96 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={markAllAsRead}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : !data || data.notifications.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50 mb-2" />
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">No new notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.notifications.map((notif) => {
                const Icon = getIcon(notif.type, notif.severity)
                const isRead = readIds.has(notif.id)
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors group',
                      !isRead && 'bg-primary/5'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      getSeverityColor(notif.severity)
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{notif.title}</p>
                        {!isRead && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{formatTime(notif.timestamp)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {data && data.notifications.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs gap-1.5"
              onClick={() => {
                fetchNotifications()
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
