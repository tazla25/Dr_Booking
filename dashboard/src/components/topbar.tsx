// /home/z/my-project/src/components/topbar.tsx
'use client'

import { useApp } from './providers'
import { useTheme } from './theme-provider'
import { Button } from './ui/button'
import {
  Menu,
  Sun,
  Moon,
  Globe,
  LogOut,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { t, lang, setLang, user, logout } = useApp()
  const { theme, toggle } = useTheme()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    toast.success(t('signOut'))
    router.push('/')
  }

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {user?.role === 'admin' ? t('dashboard') : t('todaysQueue')}
            </h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Language toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            className="gap-1.5"
            aria-label="Toggle language"
          >
            <Globe className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase">{lang}</span>
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Sign out */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{t('signOut')}</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
