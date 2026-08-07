// /home/z/my-project/src/lib/validators.ts
// Input validation helpers — addresses analysis Phase 0 issue: "No input validation".

import { z } from 'zod'

export const emailSchema = z.string().email().toLowerCase().trim()

// IMP-V4-009: auto-prepend +91 for 10-digit Indian numbers (no + prefix).
// Indian users commonly type "9876543210" — the bot auto-prepends +91,
// so the dashboard should too. Numbers starting with 6-9 and exactly 10
// digits are treated as Indian mobile numbers.
export const phoneSchema = z
  .string()
  .trim()
  .transform((p) => p.replace(/[\s-]/g, ''))
  .transform((p) => {
    // Auto-prepend +91 for 10-digit Indian mobile numbers (start with 6-9)
    if (/^[6-9]\d{9}$/.test(p)) return `+91${p}`
    // Auto-prepend + if missing but starts with country code digits
    if (/^\d{11,15}$/.test(p) && !p.startsWith('+')) return `+${p}`
    return p
  })
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10-15 digits'))

export const pinCodeSchema = z
  .number()
  .int()
  .min(100000, 'PIN must be 6 digits')
  .max(999999, 'PIN must be 6 digits')
export const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be HH:mm (24h)')

// IMP-V4-004: date schema that rejects past dates. Used by walk-in and
// schedule override forms. The base dateSchema (below) still allows past
// dates for queries where historical data is needed (e.g., analytics).
export const futureDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((d) => {
    const today = new Date().toISOString().split('T')[0]
    return d >= today
  }, 'Date cannot be in the past')

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters')
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')

export const doctorSchema = z.object({
  fullName: nameSchema,
  specialization: z.string().trim().min(2).max(80),
  phone: phoneSchema.optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  fee: z.number().int().min(0).max(100000),
  rating: z.number().min(0).max(5),
  isActive: z.boolean(),
})

export const scheduleSchema = z
  .object({
    doctorId: z.string().min(1),
    pinCode: pinCodeSchema,
    dayOfWeek: z.enum([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]),
    startTime: timeSchema,
    endTime: timeSchema,
    clinicName: z.string().trim().max(120).optional().or(z.literal('')),
    clinicAddress: z.string().trim().max(300).optional().or(z.literal('')),
    avgMinutesPerPatient: z.number().int().min(1).max(180),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  })

export const appointmentStatusSchema = z.enum([
  'Pending',
  'Confirmed',
  'Completed',
  'Cancelled',
  'NoShow',
])

export const rescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  newDate: dateSchema,
}).refine(
  (data) => {
    const today = new Date().toISOString().split('T')[0]
    return data.newDate >= today
  },
  {
    message: 'Cannot reschedule to a past date',
    path: ['newDate'],
  }
)

export type DoctorInput = z.infer<typeof doctorSchema>
export type ScheduleInput = z.infer<typeof scheduleSchema>
