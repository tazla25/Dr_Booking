// /home/z/my-project/src/components/receipt-dialog.tsx
// Printable receipt dialog for completed appointments.
// Opens a modal with the receipt details and a "Print" button.
'use client'

import { useState } from 'react'
import { api } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'
import { Badge } from './ui/badge'
import {
  Printer,
  Download,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Stethoscope,
  IndianRupee,
  FileText,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

interface ReceiptData {
  receipt: {
    receiptNo: string
    receiptDate: string
    appointment: {
      id: string
      date: string
      queueNumber: number
      status: string
      token: string
      notes: string | null
      createdAt: string
    }
    patient: {
      name: string
      phone: string
    }
    doctor: {
      fullName: string
      specialization: string
      phone: string | null
      email: string | null
    }
    clinic: {
      name: string
      address: string
      pinCode: number | null
      landmark: string | null
      timing: string | null
    }
    payment: {
      fee: number
      currency: string
      status: string
      method: string
    }
    feedback: { rating: number; comment: string | null } | null
    generatedBy: {
      name: string
      role: string
    }
  }
}

interface ReceiptDialogProps {
  appointmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReceiptDialog({ appointmentId, open, onOpenChange }: ReceiptDialogProps) {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchReceipt = async (id: string) => {
    setLoading(true)
    setData(null)
    try {
      const d = await api<ReceiptData>(`/api/appointments/${id}/receipt`)
      setData(d)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load receipt')
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  // Fetch when opened
  if (open && appointmentId && !data && !loading) {
    fetchReceipt(appointmentId)
  }

  const handlePrint = () => {
    // Create a hidden iframe with the receipt HTML and print it
    if (!data) return

    const receipt = data.receipt
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) {
      toast.error('Please allow popups to print the receipt')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt ${receipt.receiptNo}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 40px; color: #1a1a1a; max-width: 600px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 3px solid #0d9488; padding-bottom: 20px; margin-bottom: 24px; }
          .header h1 { font-size: 28px; color: #0d9488; margin-bottom: 4px; }
          .header p { font-size: 13px; color: #666; }
          .receipt-no { text-align: right; font-size: 12px; color: #666; margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #0d9488; margin-bottom: 8px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
          .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
          .row .label { color: #666; font-weight: 500; }
          .row .value { font-weight: 600; }
          .doctor-info { background: #f0fdfa; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
          .doctor-info h3 { font-size: 16px; color: #0d9488; margin-bottom: 2px; }
          .doctor-info p { font-size: 12px; color: #666; }
          .queue-badge { display: inline-block; background: #0d9488; color: white; padding: 8px 16px; border-radius: 20px; font-size: 20px; font-weight: bold; }
          .payment-box { background: #f0fdfa; border: 2px solid #0d9488; border-radius: 8px; padding: 16px; margin-top: 16px; text-align: center; }
          .payment-box .amount { font-size: 32px; font-weight: bold; color: #0d9488; }
          .payment-box .status { font-size: 12px; color: #666; margin-top: 4px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #e5e5e5; padding-top: 16px; }
          .footer p { margin-bottom: 4px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Dr_Booking</h1>
          <p>Smart Queue & Booking System · Reform Edition</p>
        </div>

        <div class="receipt-no">
          <strong>Receipt No:</strong> ${receipt.receiptNo}<br>
          <strong>Date:</strong> ${new Date(receipt.receiptDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>

        <div class="doctor-info">
          <h3>${receipt.doctor.fullName}</h3>
          <p>${receipt.doctor.specialization}</p>
          ${receipt.doctor.phone ? `<p>Phone: ${receipt.doctor.phone}</p>` : ''}
        </div>

        <div class="section">
          <h2>Patient Details</h2>
          <div class="row"><span class="label">Name</span><span class="value">${receipt.patient.name}</span></div>
          <div class="row"><span class="label">Phone</span><span class="value">${receipt.patient.phone}</span></div>
        </div>

        <div class="section">
          <h2>Appointment Details</h2>
          <div class="row"><span class="label">Date</span><span class="value">${new Date(receipt.appointment.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
          <div class="row"><span class="label">Queue Number</span><span class="value"><span class="queue-badge">#${receipt.appointment.queueNumber}</span></span></div>
          <div class="row"><span class="label">Status</span><span class="value">${receipt.appointment.status}</span></div>
          ${receipt.clinic.timing ? `<div class="row"><span class="label">Timing</span><span class="value">${receipt.clinic.timing}</span></div>` : ''}
          ${receipt.appointment.notes ? `<div class="row"><span class="label">Notes</span><span class="value">${receipt.appointment.notes}</span></div>` : ''}
        </div>

        <div class="section">
          <h2>Clinic</h2>
          <div class="row"><span class="label">Name</span><span class="value">${receipt.clinic.name}</span></div>
          ${receipt.clinic.address ? `<div class="row"><span class="label">Address</span><span class="value">${receipt.clinic.address}</span></div>` : ''}
          ${receipt.clinic.pinCode ? `<div class="row"><span class="label">PIN</span><span class="value">${receipt.clinic.pinCode}</span></div>` : ''}
          ${receipt.clinic.landmark ? `<div class="row"><span class="label">Landmark</span><span class="value">${receipt.clinic.landmark}</span></div>` : ''}
        </div>

        <div class="payment-box">
          <p style="font-size: 12px; color: #666; margin-bottom: 4px;">Consultation Fee</p>
          <div class="amount">₹${receipt.payment.fee.toLocaleString('en-IN')}</div>
          <div class="status">Payment Status: ${receipt.payment.status} · Method: ${receipt.payment.method}</div>
        </div>

        ${receipt.feedback ? `
        <div class="section" style="margin-top: 20px;">
          <h2>Patient Feedback</h2>
          <div class="row"><span class="label">Rating</span><span class="value">${'★'.repeat(receipt.feedback.rating)}${'☆'.repeat(5 - receipt.feedback.rating)}</span></div>
          ${receipt.feedback.comment ? `<div class="row"><span class="label">Comment</span><span class="value">${receipt.feedback.comment}</span></div>` : ''}
        </div>
        ` : ''}

        <div class="footer">
          <p>Generated by ${receipt.generatedBy.name} (${receipt.generatedBy.role})</p>
          <p>This is a computer-generated receipt and does not require a physical signature.</p>
          <p>Dr_Booking · Reform Edition · ${new Date().getFullYear()}</p>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setData(null)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Appointment Receipt
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4 py-2">
            {/* Receipt header */}
            <div className="text-center border-b border-border pb-4">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-lg text-primary">Dr_Booking</p>
                  <p className="text-[10px] text-muted-foreground">Smart Queue & Booking</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Receipt No: <span className="font-mono font-semibold text-foreground">{data.receipt.receiptNo}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(data.receipt.receiptDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>

            {/* Doctor info */}
            <div className="bg-primary/5 rounded-lg p-3">
              <p className="font-semibold text-foreground">{data.receipt.doctor.fullName}</p>
              <p className="text-xs text-muted-foreground">{data.receipt.doctor.specialization}</p>
              {data.receipt.doctor.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="w-3 h-3" />{data.receipt.doctor.phone}
                </p>
              )}
            </div>

            {/* Patient + Appointment */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patient</p>
                <p className="font-medium">{data.receipt.patient.name}</p>
                <p className="text-xs text-muted-foreground">{data.receipt.patient.phone}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Date</p>
                <p className="font-medium">{new Date(data.receipt.appointment.date + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Queue Number</p>
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  #{data.receipt.appointment.queueNumber}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
                <Badge variant={data.receipt.appointment.status === 'Completed' ? 'default' : 'secondary'}>
                  {data.receipt.appointment.status}
                </Badge>
              </div>
            </div>

            {/* Clinic */}
            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Clinic
              </p>
              <p className="text-sm font-medium">{data.receipt.clinic.name}</p>
              {data.receipt.clinic.address && (
                <p className="text-xs text-muted-foreground">{data.receipt.clinic.address}</p>
              )}
              {data.receipt.clinic.timing && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />{data.receipt.clinic.timing}
                </p>
              )}
            </div>

            {/* Payment */}
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20 rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Consultation Fee</p>
              <p className="text-3xl font-bold text-primary flex items-center justify-center gap-1">
                <IndianRupee className="w-6 h-6" />
                {data.receipt.payment.fee.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.receipt.payment.status} · {data.receipt.payment.method}
              </p>
            </div>

            {/* Feedback */}
            {data.receipt.feedback && (
              <div className="border-t border-border pt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Patient Feedback</p>
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 text-lg">{'★'.repeat(data.receipt.feedback.rating)}</span>
                  <span className="text-muted-foreground text-lg">{'☆'.repeat(5 - data.receipt.feedback.rating)}</span>
                </div>
                {data.receipt.feedback.comment && (
                  <p className="text-sm text-muted-foreground mt-1 italic">&ldquo;{data.receipt.feedback.comment}&rdquo;</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">Failed to load receipt.</div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} className="gap-1.5">
            <X className="w-4 h-4" />
            Close
          </Button>
          <Button onClick={handlePrint} disabled={!data} className="gap-1.5">
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
