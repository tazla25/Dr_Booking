// /home/z/my-project/src/components/views/settings-view.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { useTheme } from '../theme-provider'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Globe, Moon, Sun, KeyRound, ShieldAlert, History, User, UserPlus, Users, Trash2, Loader2, Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()

  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [failed, setFailed] = useState<{ count: number; recent: FailedLoginEntry[] }>({ count: 0, recent: [] })
  const [loading, setLoading] = useState(true)

  // Compounder management state (V8-2 + V8-15)
  const [compounders, setCompounders] = useState<Array<{ id: string; name: string; phone: string; whatsappNumber: string | null; isActive: boolean; invitedAt: string; lastLoginAt: string | null }>>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePhone, setInvitePhone] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

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

      // Fetch compounders if user is a doctor (V8-15)
      if (user?.role === 'DOCTOR') {
        try {
          const compData = await api<{ compounders: typeof compounders }>('/api/admin/compounders')
          setCompounders(compData.compounders)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [user])

  // V8-2: Invite compounder
  const inviteCompounder = async () => {
    if (!invitePhone.trim()) { toast.error(t('phoneNumberRequired')); return }
    setInviting(true)
    try {
      await api('/api/admin/invite-compounder', { method: 'POST', body: JSON.stringify({ compounderPhone: invitePhone.trim() }) })
      toast.success(t('compounderInvited'))
      setInviteOpen(false)
      setInvitePhone('')
      fetchAux()
    } catch (e) {
      toast.error((e as Error).message || t('failedToInvite'))
    } finally {
      setInviting(false)
    }
  }

  // V8-15: Remove compounder
  const removeCompounder = async (id: string) => {
    setRemovingId(id)
    try {
      await api(`/api/admin/compounders/${id}`, { method: 'DELETE' })
      toast.success(t('accessRemoved'))
      fetchAux()
    } catch (e) {
      toast.error((e as Error).message || t('failedToRemove'))
    } finally {
      setRemovingId(null)
    }
  }

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
                <Label className="text-xs text-muted-foreground">{t('verificationStatus')}</Label>
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
                <Label className="text-xs text-muted-foreground">{t('medicalRegNumber')}</Label>
                <p className="text-sm font-medium">{user.medicalRegNumber}</p>
              </div>
            )}
            {user?.role === 'DOCTOR' && user.specialization && (
              <div>
                <Label className="text-xs text-muted-foreground">{t('specialization')}</Label>
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
                  ? new Date(user.lastLoginAt).toLocaleString(lang === 'bn' ? 'bn-IN' : 'en-US')
                  : t('none')}
              </p>
            </div>
          </div>
          {/* IMP-V4-002: doctors can edit their own profile (fee, phone,
              specialization) directly from Settings. Opens a dialog that
              calls PUT /api/doctors/{id}. */}
          {user?.role === 'DOCTOR' && user?.doctor?.id && (
            <div className="pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => router.push(`/?view=doctors`)} className="gap-2">
                <Pencil className="w-3.5 h-3.5" />
                Edit My Doctor Profile
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">
                Update your consultation fee, specialization, and contact info in the Doctors view.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Management (V8-2 + V8-15) — doctors only */}
      {user?.role === 'DOCTOR' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {t('teamManagement')}
            </CardTitle>
            <CardDescription>{t('teamManagementDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => setInviteOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              {t('inviteCompounder')}
            </Button>

            {compounders.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('currentCompounders')}</p>
                {compounders.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-md bg-muted/40">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.whatsappNumber ? `✅ ${t('whatsappLinked')}` : `⏳ ${t('waitingForLink')}`} ·
                        {t('invitedOn')} {new Date(c.invitedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={c.isActive ? 'default' : 'secondary'} className="text-[10px]">
                      {c.isActive ? t('active') : t('inactive')}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => removeCompounder(c.id)}
                      disabled={removingId === c.id}
                    >
                      {removingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('noCompounders')}
              </p>
            )}

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md p-3 text-xs text-blue-700 dark:text-blue-400">
              <strong>{t('howItWorks')}:</strong> {t('howItWorksDesc')}
              <code className="mx-1 px-1 py-0.5 bg-background rounded border border-border">/link {'<their-phone>'}</code>
              {t('howItWorksDesc2')}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Compounder Dialog (V8-2) */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              {t('inviteCompounder')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t('inviteCompounderDesc')}
            </p>
            <div className="space-y-2">
              <Label>{t('compounderPhone')}</Label>
              <Input
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                placeholder="+919876543210"
                onKeyDown={(e) => { if (e.key === 'Enter') inviteCompounder() }}
              />
            </div>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
              {t('howItWorksDesc')}
              <code className="px-1 py-0.5 bg-background rounded border border-border">/link {invitePhone || '<their-phone>'}</code>
              {t('howItWorksDesc2')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>{t('cancelBtn')}</Button>
            <Button onClick={inviteCompounder} disabled={inviting || !invitePhone.trim()} className="gap-2">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {t('invite')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Security: Phone + Password authentication (v11) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            {t('authenticationMethod')}
          </CardTitle>
          <CardDescription className="text-xs">
            {t('authMethodDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('phoneNumber')}
              </p>
              <p className="text-sm font-medium font-mono">
                {user?.phone || t('none')}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t('primaryLoginIdentifier')}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('whatsappNumber')}
              </p>
              <p className="text-sm font-medium font-mono">
                {user?.whatsappNumber || t('none')}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {user?.whatsappNumber ? t('linkedToWhatsapp') : t('notLinkedUseLink')}
              </p>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
            <KeyRound className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t('phonePasswordAuthActive')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('authMethodHelp1')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('authMethodHelp2')}
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
                        {new Date(f.attemptedAt).toLocaleString(lang === 'bn' ? 'bn-IN' : 'en-US')}
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
                    {new Date(l.createdAt).toLocaleString(lang === 'bn' ? 'bn-IN' : 'en-US')}
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
