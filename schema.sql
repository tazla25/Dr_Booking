-- smart-queue-bot/schema.sql
-- Run this entire file in Supabase SQL Editor to create all tables.

-- ─── 1. Doctors ──────────────────────────────────────────────────────────────
CREATE TABLE doctors (
  doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Schedules & Locations ────────────────────────────────────────────────
CREATE TABLE schedules (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  pin_code INTEGER NOT NULL,
  day_of_week TEXT NOT NULL,   -- e.g. 'Wednesday'
  start_time TEXT NOT NULL,    -- e.g. '10:00'
  end_time TEXT NOT NULL,      -- e.g. '14:00'
  clinic_name TEXT,
  clinic_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_pin ON schedules(pin_code);
CREATE INDEX idx_schedules_doctor ON schedules(doctor_id);

-- ─── 3. Appointments ─────────────────────────────────────────────────────────
CREATE TABLE appointments (
  booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  schedule_id UUID REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  queue_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, appointment_date, queue_number)
);

CREATE INDEX idx_appointments_schedule_date ON appointments(schedule_id, appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- ─── 4. Admin Access ─────────────────────────────────────────────────────────
CREATE TABLE admin_access (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  secret_pin_hash TEXT NOT NULL,  -- bcrypt hashed PIN
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. Sessions ─────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  chat_id TEXT PRIMARY KEY,
  step TEXT NOT NULL DEFAULT 'IDLE',
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Auto-update updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Atomic Booking Function (prevents race conditions) ────────────────────────
CREATE OR REPLACE FUNCTION create_booking_atomic(
  p_patient_name TEXT,
  p_patient_phone TEXT,
  p_schedule_id UUID,
  p_appointment_date DATE
)
RETURNS SETOF appointments
LANGUAGE plpgsql
AS $$
DECLARE
  v_queue_number INTEGER;
  v_booking appointments%ROWTYPE;
BEGIN
  -- Lock the relevant rows to prevent concurrent inserts from getting same queue number
  -- This SELECT ... FOR UPDATE locks any existing appointments for this schedule+date
  PERFORM 1 FROM appointments
  WHERE schedule_id = p_schedule_id
    AND appointment_date = p_appointment_date
  FOR UPDATE;

  -- Get the next queue number
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_queue_number
  FROM appointments
  WHERE schedule_id = p_schedule_id
    AND appointment_date = p_appointment_date;

  -- Insert the new appointment
  INSERT INTO appointments (patient_name, patient_phone, schedule_id, appointment_date, queue_number, status)
  VALUES (p_patient_name, p_patient_phone, p_schedule_id, p_appointment_date, v_queue_number, 'Confirmed')
  RETURNING * INTO v_booking;

  RETURN NEXT v_booking;
END;
$$;

-- ─── Admin PIN Verification Function ───────────────────────────────────────────
-- Note: bcrypt verification happens in application layer (Node.js)
-- This function is a placeholder if you want to do it in SQL with pgcrypto
CREATE OR REPLACE FUNCTION verify_admin_pin(p_pin_hash TEXT, p_input_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- In production, use pgcrypto: RETURN p_pin_hash = crypt(p_input_pin, p_pin_hash);
  -- For now, application layer handles bcrypt verification
  RETURN FALSE;
END;
$$;

-- ─── Seed Data (for testing) ─────────────────────────────────────────────────
-- Step 1: Insert a doctor
INSERT INTO doctors (full_name, specialization)
VALUES ('Dr. Arjun Sen', 'Optometry');

-- Step 2: After inserting, copy the doctor_id UUID from the Supabase UI
-- Then run the next two inserts replacing <doctor_uuid> with the real UUID:
-- 
-- INSERT INTO schedules (doctor_id, pin_code, day_of_week, start_time, end_time, clinic_name)
-- VALUES ('<doctor_uuid>', 700001, 'Wednesday', '10:00', '14:00', 'Sen Eye Clinic');
-- 
-- For admin PIN, hash it first in Node.js:
-- const bcrypt = require('bcrypt');
-- const hash = await bcrypt.hash('1234', 10);
-- Then insert:
-- INSERT INTO admin_access (doctor_id, secret_pin_hash)
-- VALUES ('<doctor_uuid>', '<bcrypt_hash_here>');
