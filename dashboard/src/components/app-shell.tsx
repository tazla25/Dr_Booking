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
import { AdminVerificationView } from './views/admin-verification-view'
import { PilotInsightsView } from './views/pilot-insights-view'
import { DoctorReportView } from './views/doctor-report-view'
import { AuditLogView } from './views/audit-log-view'
import { PatientsView } from './views/patients-view'
import { CalendarView } from './views/calendar-view'
import { ErrorBoundary } from './error-boundary'
import { Loader2, ShieldAlert } from 'lucide-react'

export type ViewKey =
  | 'dashboard'
  | 'appointments'
  | 'patients'
  | 'calendar'
  | 'doctors'
  | 'schedules'
  | 'analytics'
  | 'tracker'
  | 'settings'
  | 'admin-verification'
  | 'pilot-insights'
  | 'doctor-report'
  | 'audit-log'

// NEW-006 fix: server-side API routes already enforce RBAC, but the client
// shell was rendering any view the URL pointed at — a COMPOUNDER typing
// /?view=admin-verification would briefly see the "Verify Doctors" UI
// before the API calls failed. This map mirrors the sidebar's role rules
// (see sidebar.tsx NAV_ITEMS) and short-circuits to an AccessDeniedView
// for restricted views so the user gets a clean denial instead of a
// half-rendered broken page.
const VIEW_ROLE_RESTRICTIONS: Partial<Record<ViewKey, Array<'DOCTOR' | 'COMPOUNDER' | 'SUPER_ADMIN'>>> = {
  'doctors': ['DOCTOR', 'SUPER_ADMIN'],
  'pilot-insights': ['SUPER_ADMIN'],
  'admin-verification': ['SUPER_ADMIN'],
  'audit-log': ['DOCTOR', 'SUPER_ADMIN'],
}

function AccessDeniedView() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <ShieldAlert className="w-12 h-12 text-amber-500 mb-3" />
      <h2 className="text-xl font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        You don&apos;t have permission to view this page. If you believe this is an error, contact your administrator.
      </p>
    </div>
  )
}

export function AppShell() {
  const { user, loadingAuth } = useApp()
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const view = (search.get('view') as ViewKey | null) || 'dashboard'
  const isPublicTracker = view === 'tracker'

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = search.get('lang') || 'en'
    }
  }, [search])

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

  // NEW-006: enforce client-side RBAC before rendering any restricted view
  const allowedRoles = VIEW_ROLE_RESTRICTIONS[view]
  const isAllowed = !allowedRoles || (user && allowedRoles.includes(user.role))

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
            <ErrorBoundary>
              {!isAllowed ? (
                <AccessDeniedView />
              ) : (
                <>
                  {view === 'dashboard' && <DashboardView />}
                  {view === 'appointments' && <AppointmentsView />}
                  {view === 'patients' && <PatientsView />}
                  {view === 'calendar' && <CalendarView />}
                  {view === 'doctors' && <DoctorsView />}
                  {view === 'schedules' && <SchedulesView />}
                  {view === 'analytics' && <AnalyticsView />}
                  {view === 'settings' && <SettingsView />}
                  {view === 'admin-verification' && <AdminVerificationView />}
                  {view === 'pilot-insights' && <PilotInsightsView />}
                  {view === 'doctor-report' && <DoctorReportView />}
                  {view === 'audit-log' && <AuditLogView />}
                </>
              )}
            </ErrorBoundary>
          </main>
          <footer className="border-t border-border bg-card px-6 py-4 text-center text-xs text-muted-foreground">
            Dr_Booking · Reform Edition · {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  )
}
