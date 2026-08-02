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
  id: 'sch-1',
  dayOfWeek: 'Wednesday',
  startTime: '10:00',
  endTime: '14:00',
  doctor: { fullName: 'Dr. Sen', specialization: 'Optometry' },
};

describe('handlePatientFlow — AWAITING_PIN step', () => {
  it('returns doctor list when PIN is valid and doctors found', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_PIN' });
    doctorService.getDoctorsByPin.mockResolvedValue([MOCK_SCHEDULE]);

    const reply = await handlePatientFlow('123', '700001');

    expect(reply.text || reply).toContain('Dr. Sen');
    expect(session.setSession).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ step: 'AWAITING_DOCTOR_SELECTION' })
    );
  });

  it('returns NO_DOCTORS message when PIN returns no results', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_PIN' });
    doctorService.getDoctorsByPin.mockResolvedValue([]);

    const reply = await handlePatientFlow('123', '999999');
    expect(reply.text || reply).toContain('পাওয়া যায়নি');
  });

  it('returns invalid format message when PIN is not 6 digits', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_PIN' });

    const reply = await handlePatientFlow('123', '123');
    expect(reply).toContain('ডিজিট');
  });
});

describe('handlePatientFlow — AWAITING_NAME step', () => {
  it('creates booking and returns confirmation with queue number', async () => {
    session.getSession.mockReturnValue({
      step: 'AWAITING_NAME',
      selectedSchedule: { id: 'sch-1' },
      appointmentDate: '2026-07-10',
    });
    bookingService.createBooking.mockResolvedValue({
      patientName: 'Rahul Das',
      queueNumber: 3,
      appointmentDate: '2026-07-10',
    });

    const reply = await handlePatientFlow('123', 'Rahul Das');

    expect(reply).toContain('3');
    expect(reply).toContain('Rahul Das');
    expect(session.clearSession).toHaveBeenCalledWith('123');
  });
});
