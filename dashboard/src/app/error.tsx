// /home/z/my-project/src/app/error.tsx (Task 5.3)
'use client'
import { useEffect } from 'react'
import { reportClientError } from '@/lib/error-tracker'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error, { componentStack: error.digest }, window.location.href) }, [error])
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-2">An unexpected error occurred. Our team has been notified.</p>
        </div>
        <div className="bg-muted/40 rounded-md p-3 text-xs text-left font-mono text-muted-foreground">
          {error.message || 'Unknown error'}
          {error.digest && <div className="mt-1">Digest: {error.digest}</div>}
        </div>
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} className="gap-2"><RefreshCw className="w-4 h-4" />Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      </div>
    </div>
  )
}
