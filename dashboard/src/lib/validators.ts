// /home/z/my-project/src/lib/validators.ts
// Input validation helpers — addresses analysis Phase 0 issue: "No input validation".

import { z } from 'zod'

export const emailSchema = z.string().email().toLowerCase().trim()
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10-15 digits')
export const pinCodeSchema = z
  .number()
  .int()
  .min(100000, 'PIN must be 6 digits')
  .max(999999, 'PIN must be 6 digits')
export const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be HH:mm (24h)')
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
})

export type DoctorInput = z.infer<typeof doctorSchema>
export type ScheduleInput = z.infer<typeof scheduleSchema>
