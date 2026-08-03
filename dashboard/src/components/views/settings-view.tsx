// /home/z/my-project/src/components/views/settings-view.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { useTheme } from '../theme-provider'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Globe, Moon, Sun, KeyRound, ShieldAlert, History, User } from 'lucide-react'

interface AuditEntry {
  id: number
  action: string
  target: string | null
  detail: string | null
  ipAddress: string | null
  createdAt: string
  adminUser: { name: string; email: string } | null
}

interface FailedLoginEntry {
  id: number
  email: string
  ipAddress: string | null
  attemptedAt: string
}

export function SettingsView() {
  const { t, lang, setLang, user } = useApp()
  const { theme, setTheme } = useTheme()

  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [failed, setFailed] = useState<{ count: number; recent: FailedLoginEntry[] }>({ count: 0, recent: [] })
  const [loading, setLoading] = useState(true)

  const fetchAux = useCallback(async () => {
    setLoading(true)
    try {
      const [auditData, failData] = await Promise.all([
        api<{ logs: AuditEntry[] }>('/api/audit-log?limit=15'),
        api<{ email: string; count: number; recent: FailedLoginEntry[] }>(
          `/api/me/failed-logins?email=${encodeURIComponent(user?.email || '')}`
        ),
      ])
      setAudit(auditData.logs)
      setFailed({ count: failData.count, recent: failData.recent })
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchAux()
  }, [fetchAux])

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('accountSettings')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('profile')} · {t('preferences')} · {t('security')}</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            {t('profile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">{t('fullName')}</Label>
              <p className="text-sm font-medium">{user?.name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('email')}</Label>
              <p className="text-sm font-medium">{user?.email}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('role')}</Label>
              <p>
                <Badge variant="secondary" className="uppercase">{user?.role}</Badge>
              </p>
            </div>
            {user?.role === 'DOCTOR' && (
              <div>
                <Label className="text-xs text-muted-foreground">Verification Status</Label>
                <p>
                  <Badge
                    variant={user.verificationStatus === 'VERIFIED' ? 'default' : 'secondary'}
                    className="uppercase"
                  >
                    {user.verificationStatus}
                  </Badge>
                </p>
              </div>
            )}
            {user?.role === 'DOCTOR' && user.medicalRegNumber && (
              <div>
                <Label className="text-xs text-muted-foreground">Medical Reg. Number</Label>
                <p className="text-sm font-medium">{user.medicalRegNumber}</p>
              </div>
            )}
            {user?.role === 'DOCTOR' && user.specialization && (
              <div>
                <Label className="text-xs text-muted-foreground">Specialization</Label>
                <p className="text-sm font-medium">{user.specialization}</p>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">{t('doctor')}</Label>
              <p className="text-sm font-medium">{user?.doctor?.fullName || t('none')}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('lastLogin')}</Label>
              <p className="text-sm font-medium">
                {user?.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')
                  : t('none')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            {t('preferences')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t('language')}</Label>
              <p className="text-xs text-muted-foreground">{t('bengali')} · {t('english')}</p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={lang === 'bn' ? 'default' : 'outline'}
                onClick={() => setLang('bn')}
              >
                বাংলা
              </Button>
              <Button
                size="sm"
                variant={lang === 'en' ? 'default' : 'outline'}
                onClick={() => setLang('en')}
              >
                English
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <Label>{t('theme')}</Label>
              <p className="text-xs text-muted-foreground">{t('lightMode')} · {t('darkMode')}</p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
                className="gap-1.5"
              >
                <Sun className="w-3.5 h-3.5" />
                {t('light')}
              </Button>
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
                className="gap-1.5"
              >
                <Moon className="w-3.5 h-3.5" />
                {t('dark')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security: Bot identity & magic link auth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Authentication Method
          </CardTitle>
          <CardDescription className="text-xs">
            You authenticate via bot-issued Magic Links — no password is set on this account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Telegram Chat ID
              </p>
              <p className="text-sm font-medium font-mono">
                {user?.id ? '••••••••' : t('none')}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Linked via Telegram bot onboarding
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                WhatsApp Number
              </p>
              <p className="text-sm font-medium font-mono">
                {user?.id ? '••••••••' : t('none')}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Alternative bot channel
              </p>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
            <KeyRound className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Magic Link Authentication Active
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                To sign in, open the Telegram bot and tap &ldquo;Open Dashboard&rdquo;.
                Each magic link is single-use and expires after 2 hours.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security: failed logins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            {t('security')} · {t('failedAttempts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <p className="text-sm">
                {t('failedAttempts')}: <span className="font-semibold">{failed.count}</span>
              </p>
              {failed.recent.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {failed.recent.slice(0, 5).map((f) => (
                    <li key={f.id} className="flex items-center justify-between bg-accent/30 rounded px-2 py-1">
                      <span className="text-muted-foreground">{f.email}</span>
                      <span className="text-muted-foreground">
                        {new Date(f.attemptedAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">{t('none')}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            {t('auditLog')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('noAuditLogs')}</p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {audit.map((l) => (
                <li key={l.id} className="text-xs flex items-start justify-between gap-3 bg-accent/30 rounded px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="font-medium">{l.action}</p>
                    {l.detail && <p className="text-muted-foreground truncate">{l.detail}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {l.adminUser?.name || 'system'}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
