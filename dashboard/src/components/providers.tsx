// /home/z/my-project/src/components/providers.tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { Lang, t as translate, StringKey } from '@/lib/i18n'
import { api } from '@/lib/api-client'

// ---------- Types ----------
export type Role = 'DOCTOR' | 'COMPOUNDER' | 'SUPER_ADMIN'
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'

export interface AuthUser {
  id: string
  email: string | null
  name: string
  role: Role
  verificationStatus: VerificationStatus
  medicalRegNumber?: string | null
  specialization?: string | null
  phone?: string | null
  telegramChatId?: string | null
  whatsappNumber?: string | null
  ownedDoctorId?: string | null
  delegatedDoctorId?: string | null
  doctor?: { id: string; fullName: string; specialization: string } | null
  lastLoginAt?: string | null
}

interface AppCtx {
  // auth
  user: AuthUser | null
  loadingAuth: boolean
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
  // language
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: StringKey) => string
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within Providers')
  return ctx
}

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [lang, setLangState] = useState<Lang>('en')

  // Load saved language
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('drb_lang')) as Lang | null
    if (saved === 'bn' || saved === 'en') setLangState(saved)
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') localStorage.setItem('drb_lang', l)
    document.documentElement.lang = l
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const data = await api<{ user: AuthUser | null }>('/api/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoadingAuth(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const t = useCallback((key: StringKey) => translate(key, lang), [lang])

  return (
    <Ctx.Provider
      value={{ user, loadingAuth, refreshUser, logout, lang, setLang, t }}
    >
      {children}
    </Ctx.Provider>
  )
}
