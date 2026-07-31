// /home/z/my-project/src/components/app-shell.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useApp } from './providers'
import { useTheme } from './theme-provider'
import { BotAccessRequiredView } from './views/bot-access-required-view'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { DashboardView } from './views/dashboard-view'
import { AppointmentsView } from './views/appointments-view'
import { DoctorsView } from './views/doctors-view'
import { SchedulesView } from './views/schedules-view'
import { AnalyticsView } from './views/analytics-view'
import { TrackerView } from './views/tracker-view'
import { SettingsView } from './views/settings-view'
import { Loader2 } from 'lucide-react'

export type ViewKey =
  | 'dashboard'
  | 'appointments'
  | 'doctors'
  | 'schedules'
  | 'analytics'
  | 'tracker'
  | 'settings'

export function AppShell() {
  const { user, loadingAuth } = useApp()
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const view = (search.get('view') as ViewKey | null) || 'dashboard'
  const isPublicTracker = view === 'tracker'

  // Update document title with language
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = search.get('lang') || 'en'
    }
  }, [search])

  // Public tracker view — render without auth/shell
  if (isPublicTracker) {
    return <TrackerView />
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return <BotAccessRequiredView />
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar
          currentView={view}
          onNavigate={(v) => {
            router.push(`/?view=${v}`)
            setSidebarOpen(false)
          }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {view === 'dashboard' && <DashboardView />}
            {view === 'appointments' && <AppointmentsView />}
            {view === 'doctors' && <DoctorsView />}
            {view === 'schedules' && <SchedulesView />}
            {view === 'analytics' && <AnalyticsView />}
            {view === 'settings' && <SettingsView />}
          </main>
          <footer className="border-t border-border bg-card px-6 py-4 text-center text-xs text-muted-foreground">
            Dr_Booking · Reform Edition · {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  )
}
