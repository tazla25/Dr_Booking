'use client'

import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AppShell />
    </Suspense>
  )
}
