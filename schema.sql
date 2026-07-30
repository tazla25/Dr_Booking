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
  secret_pin TEXT NOT NULL,  -- Store hashed in production!
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- ─── Seed Data (for testing) ─────────────────────────────────────────────────
-- Step 1: Insert a doctor
INSERT INTO doctors (full_name, specialization)
VALUES ('Dr. Arjun Sen', 'Optometry');

-- Step 2: After inserting, copy the doctor_id UUID from the Supabase UI
-- Then run the next two inserts replacing <doctor_uuid> with the real UUID:

-- INSERT INTO schedules (doctor_id, pin_code, day_of_week, start_time, end_time, clinic_name)
-- VALUES ('<doctor_uuid>', 700001, 'Wednesday', '10:00', '14:00', 'Sen Eye Clinic');

-- INSERT INTO admin_access (doctor_id, secret_pin)
-- VALUES ('<doctor_uuid>', '1234');
