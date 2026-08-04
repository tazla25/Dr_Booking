// /home/z/my-project/src/app/auth/session/page.tsx
//
// Direct Session Login Page (Feature 1)
// =====================================
//
// This is the page users land on when they click the dashboard link
// the bot sends after a successful /login (phone + password).
//
// URL shape: /auth/session?sid=SESSION_ID&token=RAW_TOKEN
//
// The bot writes a Session row directly to the DB (with tokenHash = HMAC(token)).
// This page POSTs to /api/auth/session-login, which:
//   1. Looks up the session by ID
//   2. Verifies the token hash matches
//   3. Checks the session hasn't expired
//   4. Creates a new dashboard session (with cookie) via createSessionForUser
//   5. Deletes the bot-created session (single-use)
//
// This replaces the old magic-link flow that required the bot to call
// /api/auth/generate-magic-link, which added a network round-trip and a
// dependency on the dashboard being online at login time.

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react'

function SessionInner() {
  const router = useRouter()
  const search = useSearchParams()
  const sessionId = search.get('sid')
  const token = search.get('token')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!sessionId || !token) {
      setStatus('error')
      setErrorMsg('Missing session parameters. Please request a new login link from the bot.')
      return
    }

    api('/api/auth/session-login', {
      method: 'POST',
      body: JSON.stringify({ sessionId, token }),
    })
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/?view=dashboard'), 800)
      })
      .catch((e: Error) => {
        setStatus('error')
        setErrorMsg(e.message || 'Session verification failed. Please login again.')
      })
  }, [sessionId, token, router])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden shadow-xl">
          <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-foreground/15 backdrop-blur flex items-center justify-center mb-3">
              <Activity className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold">Dr_Booking</h1>
            <p className="text-sm text-primary-foreground/80 mt-1">
              {status === 'verifying' && 'Verifying your session...'}
              {status === 'success' && 'Login successful!'}
              {status === 'error' && 'Login failed'}
            </p>
          </div>
          <CardContent className="p-8 flex flex-col items-center text-center">
            {status === 'verifying' && (
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            )}
            {status === 'success' && (
              <>
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="w-12 h-12 text-red-500 mb-3" />
                <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>
                <button
                  onClick={() => router.push('/')}
                  className="mt-4 text-sm text-primary hover:underline"
                >
                  Return to login
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <SessionInner />
    </Suspense>
  )
}
