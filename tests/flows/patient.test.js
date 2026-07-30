// tests/flows/patient.test.js
const { handlePatientFlow } = require('../../src/flows/patient');

jest.mock('../../src/services/doctorService', () => ({
  getDoctorsByPin: jest.fn(),
}));
jest.mock('../../src/services/bookingService', () => ({
  createBooking: jest.fn(),
}));
jest.mock('../../src/bot/session', () => ({
  getSession: jest.fn(),
  setSession: jest.fn(),
  clearSession: jest.fn(),
}));

const doctorService = require('../../src/services/doctorService');
const bookingService = require('../../src/services/bookingService');
const session = require('../../src/bot/session');

const MOCK_SCHEDULE = {
  schedule_id: 'sch-1',
  day_of_week: 'Wednesday',
  start_time: '10:00',
  end_time: '14:00',
  doctors: { full_name: 'Dr. Sen', specialization: 'Optometry' },
};

describe('handlePatientFlow — AWAITING_PIN step', () => {
  it('returns doctor list when PIN is valid and doctors found', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_PIN' });
    doctorService.getDoctorsByPin.mockResolvedValue([MOCK_SCHEDULE]);

    const reply = await handlePatientFlow('123', '700001');

    expect(reply).toContain('Dr. Sen');
    expect(session.setSession).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ step: 'AWAITING_DOCTOR_SELECTION' })
    );
  });

  it('returns NO_DOCTORS message when PIN returns no results', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_PIN' });
    doctorService.getDoctorsByPin.mockResolvedValue([]);

    const reply = await handlePatientFlow('123', '999999');
    expect(reply).toContain('পাওয়া যায়নি');
  });

  it('returns invalid format message when PIN is not 6 digits', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_PIN' });

    const reply = await handlePatientFlow('123', '123');
    expect(reply).toContain('৬ ডিজিট');
  });
});

describe('handlePatientFlow — AWAITING_NAME step', () => {
  it('creates booking and returns confirmation with queue number', async () => {
    session.getSession.mockReturnValue({
      step: 'AWAITING_NAME',
      selectedSchedule: { schedule_id: 'sch-1' },
      appointmentDate: '2026-07-10',
    });
    bookingService.createBooking.mockResolvedValue({
      patient_name: 'Rahul Das',
      queue_number: 3,
      appointment_date: '2026-07-10',
    });

    const reply = await handlePatientFlow('123', 'Rahul Das');

    expect(reply).toContain('3');
    expect(reply).toContain('Rahul Das');
    expect(session.clearSession).toHaveBeenCalledWith('123');
  });
});
