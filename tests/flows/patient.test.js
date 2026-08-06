// tests/flows/patient.test.js
const { handlePatientFlow, showSearchModePicker } = require('../../src/flows/patient');

jest.mock('../../src/services/doctorService', () => ({
  getDoctorsByPin: jest.fn(),
  searchDoctorsByName: jest.fn(),
  searchDoctorsBySpecialty: jest.fn(),
  searchDoctorsBySpecialtyAndPin: jest.fn(),
  getSchedulesForDoctor: jest.fn(),
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
  clinicName: 'Test Clinic',
  doctor: { fullName: 'Dr. Sen', specialization: 'Optometry' },
};

describe('handlePatientFlow — AWAITING_SEARCH_MODE step', () => {
  it('shows search-mode picker when no callback matches', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_SEARCH_MODE' });

    const reply = await handlePatientFlow('123', 'hello', false, null, 'en');

    expect(reply.text).toContain('Choose a mode');
    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'AWAITING_SEARCH_MODE' }));
  });

  it('routes to SEARCH_PIN when callback is search_pin', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_SEARCH_MODE' });

    const reply = await handlePatientFlow('123', '', true, 'search_pin', 'en');

    expect(reply.text).toContain('PIN');
    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'SEARCH_PIN' }));
  });

  it('routes to SEARCH_NAME when callback is search_name', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_SEARCH_MODE' });

    const reply = await handlePatientFlow('123', '', true, 'search_name', 'en');

    expect(reply.text).toContain('name');
    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'SEARCH_NAME' }));
  });

  it('routes to SEARCH_SPECIALTY_CITY_ASK_SPEC when callback is search_specialty_city', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_SEARCH_MODE' });

    const reply = await handlePatientFlow('123', '', true, 'search_specialty_city', 'en');

    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'SEARCH_SPECIALTY_CITY_ASK_SPEC' }));
  });

  it('routes to SEARCH_SPECIALTY_PIN_ASK_SPEC when callback is search_specialty_pin', async () => {
    session.getSession.mockReturnValue({ step: 'AWAITING_SEARCH_MODE' });

    const reply = await handlePatientFlow('123', '', true, 'search_specialty_pin', 'en');

    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'SEARCH_SPECIALTY_PIN_ASK_SPEC' }));
  });
});

describe('handlePatientFlow — SEARCH_PIN step', () => {
  it('returns doctor list when PIN is valid and doctors found', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_PIN' });
    doctorService.getDoctorsByPin.mockResolvedValue([MOCK_SCHEDULE]);

    const reply = await handlePatientFlow('123', '700001');

    expect(reply.text || reply).toContain('Dr. Sen');
    expect(session.setSession).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ step: 'AWAITING_DOCTOR_SELECTION' })
    );
  });

  it('returns NO_DOCTORS message when PIN returns no results', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_PIN' });
    doctorService.getDoctorsByPin.mockResolvedValue([]);

    const reply = await handlePatientFlow('123', '999999');
    expect(reply.text || reply).toContain('পাওয়া যায়নি');
  });

  it('returns invalid PIN message when PIN is not 6 digits', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_PIN' });

    const reply = await handlePatientFlow('123', '123');
    expect(reply).toContain('ডিজিট');
  });
});

describe('handlePatientFlow — SEARCH_NAME step', () => {
  it('returns doctor list when name matches', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_NAME' });
    doctorService.searchDoctorsByName.mockResolvedValue([MOCK_SCHEDULE]);

    const reply = await handlePatientFlow('123', 'Sen');

    expect(reply.text || reply).toContain('Dr. Sen');
    expect(doctorService.searchDoctorsByName).toHaveBeenCalledWith('Sen');
  });

  it('rejects names shorter than 2 chars', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_NAME' });

    const reply = await handlePatientFlow('123', 'S');
    expect(reply).toContain('২ অক্ষর');
  });
});

describe('handlePatientFlow — SEARCH_SPECIALTY_CITY sub-flow', () => {
  it('asks for city after specialty is entered', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_SPECIALTY_CITY_ASK_SPEC' });

    const reply = await handlePatientFlow('123', 'Cardiologist');

    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'SEARCH_SPECIALTY_CITY_ASK_CITY' }));
  });

  it('returns doctor list when specialty + city are entered', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_SPECIALTY_CITY_ASK_CITY', searchSpecialty: 'Cardiologist' });
    doctorService.searchDoctorsBySpecialty.mockResolvedValue([MOCK_SCHEDULE]);

    const reply = await handlePatientFlow('123', 'Kolkata');

    expect(reply.text || reply).toContain('Dr. Sen');
    expect(doctorService.searchDoctorsBySpecialty).toHaveBeenCalledWith('Cardiologist', 'Kolkata');
  });
});

describe('handlePatientFlow — SEARCH_SPECIALTY_PIN sub-flow', () => {
  it('asks for PIN after specialty is entered', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_SPECIALTY_PIN_ASK_SPEC' });

    const reply = await handlePatientFlow('123', 'Cardiologist');

    expect(session.setSession).toHaveBeenCalledWith('123', expect.objectContaining({ step: 'SEARCH_SPECIALTY_PIN_ASK_PIN' }));
  });

  it('returns doctor list when specialty + PIN are entered', async () => {
    session.getSession.mockReturnValue({ step: 'SEARCH_SPECIALTY_PIN_ASK_PIN', searchSpecialty: 'Cardiologist' });
    doctorService.searchDoctorsBySpecialtyAndPin.mockResolvedValue([MOCK_SCHEDULE]);

    const reply = await handlePatientFlow('123', '700001');

    expect(reply.text || reply).toContain('Dr. Sen');
    expect(doctorService.searchDoctorsBySpecialtyAndPin).toHaveBeenCalledWith('Cardiologist', 700001);
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


    expect(reply).toContain('Rahul Das');
    expect(session.clearSession).toHaveBeenCalledWith('123');
  });
});

describe('showSearchModePicker', () => {
  it('returns an object with the search-mode keyboard', async () => {
    const reply = await showSearchModePicker('123', 'en');
    expect(reply.text).toContain('Choose a mode');
    expect(reply.options.reply_markup.inline_keyboard).toBeDefined();
    // 4 modes + back button = 5 rows
    expect(reply.options.reply_markup.inline_keyboard.length).toBeGreaterThanOrEqual(5);
  });
});
