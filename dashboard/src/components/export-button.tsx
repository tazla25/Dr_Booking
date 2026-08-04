// /home/z/my-project/src/components/export-button.tsx
// Reusable CSV export button — downloads appointments, patients, or revenue as CSV.
'use client'

import { useState } from 'react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './ui/dropdown-menu'
import { Download, FileSpreadsheet, Users, Calendar, IndianRupee, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ExportButtonProps {
  /** Export type: appointments, patients, or revenue */
  defaultType?: 'appointments' | 'patients' | 'revenue'
  /** Optional date range for appointments/revenue exports */
  from?: string
  to?: string
  /** Label for the button */
  label?: string
  /** Variant */
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'icon'
}

export function ExportButton({
  defaultType,
  from,
  to,
  label = 'Export',
  variant = 'outline',
  size = 'sm',
}: ExportButtonProps) {
  const [exporting, setExporting] = useState<string | null>(null)

  const doExport = async (type: 'appointments' | 'patients' | 'revenue') => {
    setExporting(type)
    try {
      const params = new URLSearchParams({ type })
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const res = await fetch(`/api/export?${params.toString()}`)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `Export failed: ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.split('filename="')[1]?.split('"')[0] || `${type}-export.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} exported successfully`)
    } catch (e) {
      toast.error((e as Error).message || 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  // If defaultType is specified, render a simple button
  if (defaultType) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={() => doExport(defaultType)}
        disabled={exporting === defaultType}
        className="gap-1.5"
      >
        {exporting === defaultType ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        {label}
      </Button>
    )
  }

  // Otherwise render a dropdown with all export options
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">Export as CSV</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => doExport('appointments')}
          disabled={exporting !== null}
          className="gap-2 cursor-pointer"
        >
          {exporting === 'appointments' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Calendar className="w-4 h-4 text-primary" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium">Appointments</span>
            <span className="text-[10px] text-muted-foreground">All appointment records</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => doExport('patients')}
          disabled={exporting !== null}
          className="gap-2 cursor-pointer"
        >
          {exporting === 'patients' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Users className="w-4 h-4 text-primary" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium">Patients</span>
            <span className="text-[10px] text-muted-foreground">Patient list with stats</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => doExport('revenue')}
          disabled={exporting !== null}
          className="gap-2 cursor-pointer"
        >
          {exporting === 'revenue' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-medium">Revenue Report</span>
            <span className="text-[10px] text-muted-foreground">Completed appointments + fees</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
