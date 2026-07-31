// /home/z/my-project/src/components/sidebar.tsx
'use client'

import { useApp } from './providers'
import { ViewKey } from './app-shell'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CalendarDays,
  Stethoscope,
  Clock,
  BarChart3,
  Settings,
  Activity,
  X,
} from 'lucide-react'
import { Button } from './ui/button'

interface NavItem {
  key: ViewKey
  icon: typeof LayoutDashboard
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'appointments', icon: CalendarDays },
  { key: 'doctors', icon: Stethoscope },
  { key: 'schedules', icon: Clock },
  { key: 'analytics', icon: BarChart3 },
  { key: 'settings', icon: Settings },
]

interface SidebarProps {
  currentView: ViewKey
  onNavigate: (v: ViewKey) => void
  open: boolean
  onClose: () => void
}

export function Sidebar({ currentView, onNavigate, open, onClose }: SidebarProps) {
  const { t, user } = useApp()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0 flex flex-col',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sidebar-foreground text-base leading-tight">
                {t('appName')}
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('reformEdition')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = currentView === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{t(item.key)}</span>
              </button>
            )
          })}
        </nav>

        {/* Public tracker quick link */}
        <div className="p-3 border-t border-sidebar-border">
          <a
            href="/?view=tracker"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Activity className="w-4 h-4 flex-shrink-0" />
            <span>{t('queueTracker')}</span>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-accent-foreground uppercase">
              Public
            </span>
          </a>
        </div>

        {/* User info footer */}
        {user && (
          <div className="p-3 border-t border-sidebar-border">
            <div className="px-3 py-2 rounded-lg bg-sidebar-accent/50">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary uppercase tracking-wider">
                {user.role}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
