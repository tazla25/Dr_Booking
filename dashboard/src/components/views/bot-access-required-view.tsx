// /home/z/my-project/src/components/views/bot-access-required-view.tsx
//
// Bot-First Auth — Landing Page when no session is present.
// Replaces the old email/password login.
//
// Message: "Please access your dashboard via the Telegram Bot."
// Includes a Dev Panel (visible only when NODE_ENV !== 'production') so the
// magic link flow can be exercised end-to-end in the sandbox without a real bot.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'
import { useApp } from '../providers'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import {
  Activity,
  MessageCircle,
  Loader2,
  ShieldCheck,
  KeyRound,
  Clock,
  Smartphone,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface MagicLinkResponse {
  magicLink: string
  expiresAt: string
  user: { id: string; name: string; role: string; doctor?: { fullName: string } | null }
}

const DEMO_BOT_SECRET =
  process.env.NEXT_PUBLIC_DEV_BOT_SECRET || 'dev-bot-secret-change-in-production'

const DEMO_USERS = [
  {
    label: 'Admin',
    name: 'System Administrator',
    telegramChatId: '100000001',
    role: 'admin',
  },
  {
    label: 'Compounder · Dr. Arjun Sen',
    name: 'Ramesh',
    telegramChatId: '100000002',
    role: 'compounder',
  },
  {
    label: 'Compounder · Dr. Meera Chowdhury',
    name: 'Meera Assistant',
    telegramChatId: '100000003',
    role: 'compounder',
  },
]

export function BotAccessRequiredView() {
  const { t, refreshUser } = useApp()
  const router = useRouter()
  const [generating, setGenerating] = useState<string | null>(null)

  const generateLinkFor = async (telegramChatId: string, label: string) => {
    setGenerating(label)
    try {
      // Simulate the bot calling the API with BOT_API_SECRET
      const res = await fetch('/api/auth/generate-magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEMO_BOT_SECRET}`,
        },
        body: JSON.stringify({ telegramChatId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }

      const data = (await res.json()) as MagicLinkResponse
      toast.success(`Magic link generated for ${data.user.name}`)

      // Simulate the user clicking the link in Telegram
      const token = data.magicLink.split('token=')[1]
      if (token) {
        // Navigate to the verify page (which will call /api/auth/verify)
        router.push(`/auth/verify?token=${token}`)
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to generate magic link')
      setGenerating(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <div className="w-full max-w-lg">
        <Card className="overflow-hidden shadow-xl">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-foreground/15 backdrop-blur flex items-center justify-center mb-3">
              <Activity className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold">{t('appName')}</h1>
            <p className="text-sm text-primary-foreground/80 mt-1">
              Bot-First Authentication
            </p>
          </div>

          <CardContent className="p-8 space-y-5">
            {/* Core message */}
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                Access via Telegram Bot Only
              </h2>
              <p className="text-sm text-muted-foreground">
                For security, the admin dashboard is not accessible by typing a URL or
                password. Please open your Telegram (or WhatsApp) bot and tap
                &ldquo;Open Dashboard&rdquo; to receive a secure magic link.
              </p>
            </div>

            {/* How it works */}
            <div className="bg-muted/50 rounded-xl p-4 space-y-2.5 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </div>
                <p className="text-muted-foreground">
                  Open the <strong className="text-foreground">Dr_Booking Bot</strong> in Telegram
                  or WhatsApp.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </div>
                <p className="text-muted-foreground">
                  Tap <strong className="text-foreground">&ldquo;Open Dashboard&rdquo;</strong> —
                  the bot will send you a one-time magic link.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </div>
                <p className="text-muted-foreground">
                  Click the link — you&rsquo;ll land here, get authenticated, and be redirected
                  to your dashboard.
                </p>
              </div>
            </div>

            {/* Security badges */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-card border border-border rounded-lg p-2.5">
                <Clock className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[10px] text-muted-foreground">2-hour</p>
                <p className="text-[10px] text-muted-foreground">expiry</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-2.5">
                <KeyRound className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[10px] text-muted-foreground">Single</p>
                <p className="text-[10px] text-muted-foreground">use only</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-2.5">
                <Smartphone className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[10px] text-muted-foreground">No</p>
                <p className="text-[10px] text-muted-foreground">passwords</p>
              </div>
            </div>

            {/* Open Telegram button */}
            <Button
              className="w-full gap-2 h-11"
              onClick={() => {
                window.location.href = 'https://t.me/Ax_erax_bot'
              }}
            >
              <MessageCircle className="w-4 h-4" />
              Open Dr_Booking Bot in Telegram
            </Button>

            {/* Dev panel — only visible in non-production */}
            {process.env.NODE_ENV !== 'production' && (
              <div className="border-t border-dashed border-amber-300 dark:border-amber-700 pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 uppercase tracking-wider">
                    Dev Mode
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Simulate the bot generating a magic link for a seeded user.
                  </p>
                </div>
                <div className="space-y-2">
                  {DEMO_USERS.map((u) => (
                    <Button
                      key={u.telegramChatId}
                      variant="outline"
                      size="sm"
                      className="w-full justify-between gap-2"
                      disabled={generating !== null}
                      onClick={() => generateLinkFor(u.telegramChatId, u.label)}
                    >
                      <span className="text-left">
                        <span className="block text-xs font-medium">{u.label}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          telegramChatId: {u.telegramChatId}
                        </span>
                      </span>
                      {generating === u.label ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground mt-4">
          Dr_Booking · Reform Edition · Bot-First Auth
        </p>
      </div>
    </div>
  )
}
