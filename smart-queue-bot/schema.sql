-- smart-queue-bot/schema.sql
-- Run this entire file in Supabase SQL Editor to create all tables.

-- ─── 1. Doctors ──────────────────────────────────────────────────────────────
CREATE TABLE doctors (
  doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  specialization TEXT NOT NULL
);

-- ─── 2. Schedules & Locations ────────────────────────────────────────────────
CREATE TABLE schedules (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  pin_code INTEGER NOT NULL,
  day_of_week TEXT NOT NULL,   -- e.g. 'Wednesday'
  start_time TEXT NOT NULL,    -- e.g. '10:00'
  end_time TEXT NOT NULL       -- e.g. '14:00'
);

-- ─── 3. Appointments ─────────────────────────────────────────────────────────
CREATE TABLE appointments (
  booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  schedule_id UUID REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  queue_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled'))
);

-- ─── 4. Admin Access ─────────────────────────────────────────────────────────
CREATE TABLE admin_access (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  secret_pin TEXT NOT NULL  -- 4-digit PIN (store hashed in production)
);

-- ─── Seed Data (for testing) ─────────────────────────────────────────────────
-- Step 1: Insert a doctor
INSERT INTO doctors (full_name, specialization)
VALUES ('Dr. Arjun Sen', 'Optometry');

-- Step 2: After inserting, copy the doctor_id UUID from the Supabase UI
-- Then run the next two inserts replacing <doctor_uuid> with the real UUID:

-- INSERT INTO schedules (doctor_id, pin_code, day_of_week, start_time, end_time)
-- VALUES ('<doctor_uuid>', 700001, 'Wednesday', '10:00', '14:00');

-- INSERT INTO admin_access (doctor_id, secret_pin)
-- VALUES ('<doctor_uuid>', '1234');
