// /home/z/my-project/src/app/auth/verify/page.tsx
//
// Magic Link Verification Page
// ============================
//
// This is the page users land on when they click a magic link from Telegram.
// URL shape: /auth/verify?token=XYZ
//
// Behaviour:
//   1. On mount, reads `token` from the URL query string.
//   2. POSTs to /api/auth/verify with the token.
//   3. Shows a spinner while verifying.
//   4. On success: redirects to /?view=dashboard.
//   5. On failure: shows a friendly error with a "Back to bot" CTA.

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, MessageCircle, Activity } from 'lucide-react'
import { toast } from 'sonner'

interface VerifyResponse {
  ok: boolean
  error?: string
  message?: string
  user?: { id: string; name: string; role: string }
}

function VerifyInner() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get('token')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('No token was provided in the URL. Please request a new magic link from the bot.')
      return
    }

    let cancelled = false

    async function verify() {
      try {
        const data = await api<VerifyResponse>('/api/auth/verify', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
        if (cancelled) return

        if (data.ok && data.user) {
          setStatus('success')
          toast.success(`Welcome, ${data.user.name}`)
          // Small delay so the user sees the success state
          setTimeout(() => window.location.href = '/?view=dashboard', 800)
        } else {
          setStatus('error')
          setErrorMsg(data.message || 'Verification failed.')
        }
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErrorMsg((e as Error).message || 'Verification failed.')
      }
    }

    verify()
    return () => {
      cancelled = true
    }
  }, [token, router])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden shadow-xl">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Activity className="w-5 h-5" />
              <h1 className="text-lg font-bold">Dr_Booking</h1>
            </div>
            <p className="text-xs text-primary-foreground/80">Magic Link Verification</p>
          </div>

          <CardContent className="p-8">
            {status === 'verifying' && (
              <div className="text-center py-6 space-y-4">
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Verifying your link…</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Authenticating your session. This will only take a moment.
                  </p>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Verified!</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Redirecting you to your dashboard…
                  </p>
                </div>
                <Loader2 className="w-4 h-4 mx-auto animate-spin text-muted-foreground" />
              </div>
            )}

            {status === 'error' && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
                  <XCircle className="w-10 h-10 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Verification failed</h2>
                  <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>
                </div>
                <div className="border-t border-border pt-4 mt-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Please return to the Telegram bot and request a new dashboard link.
                  </p>
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      window.location.href = process.env.NEXT_PUBLIC_BOT_URL || 'https://t.me/Ax_erax_bot'
                    }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Open Telegram Bot
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={() => router.push('/')}
                  >
                    Back to Home
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground mt-4">
          Dr_Booking · Bot-First Auth · Magic links expire after 2 hours
        </p>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  )
}
