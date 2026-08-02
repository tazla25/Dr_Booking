'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from './ui/button'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message || 'An unexpected error occurred while rendering this view.'}
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
