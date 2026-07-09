// tests/flows/admin.test.js
const { handleAdminFlow } = require('../../src/flows/admin');

jest.mock('../../src/services/adminService', () => ({
  verifyAdminPin: jest.fn(),
  getTodaysPatients: jest.fn(),
  updateAppointmentStatus: jest.fn(),
}));
jest.mock('../../src/bot/session', () => ({
  getSession: jest.fn(),
  setSession: jest.fn(),
  clearSession: jest.fn(),
}));

const adminService = require('../../src/services/adminService');
const session = require('../../src/bot/session');

const MOCK_PATIENTS = [
  { booking_id: 'bk-1', queue_number: 1, patient_name: 'Rina', status: 'Confirmed' },
  { booking_id: 'bk-2', queue_number: 2, patient_name: 'Sumon', status: 'Confirmed' },
];

describe('handleAdminFlow — ADMIN_AWAITING_PIN step', () => {
  it('shows dashboard with patient list on correct PIN', async () => {
    session.getSession.mockReturnValue({ step: 'ADMIN_AWAITING_PIN' });
    adminService.verifyAdminPin.mockResolvedValue('doc-1');
    adminService.getTodaysPatients.mockResolvedValue(MOCK_PATIENTS);

    const reply = await handleAdminFlow('999', '1234', 'sch-1');

    expect(reply).toContain('Rina');
    expect(reply).toContain('Sumon');
    expect(session.setSession).toHaveBeenCalledWith(
      '999',
      expect.objectContaining({ step: 'ADMIN_DASHBOARD' })
    );
  });

  it('returns invalid PIN message on wrong PIN', async () => {
    session.getSession.mockReturnValue({ step: 'ADMIN_AWAITING_PIN' });
    adminService.verifyAdminPin.mockResolvedValue(null);

    const reply = await handleAdminFlow('999', '0000', 'sch-1');
    expect(reply).toContain('ভুল');
  });
});

describe('handleAdminFlow — ADMIN_DASHBOARD step', () => {
  it('/next marks first confirmed patient as Completed', async () => {
    session.getSession.mockReturnValue({
      step: 'ADMIN_DASHBOARD',
      adminDoctorId: 'doc-1',
      patients: MOCK_PATIENTS,
    });
    adminService.updateAppointmentStatus.mockResolvedValue(true);

    const reply = await handleAdminFlow('999', '/next', 'sch-1');

    expect(reply).toContain('1');
    expect(adminService.updateAppointmentStatus).toHaveBeenCalledWith('bk-1', 'Completed');
  });

  it('/cancel <qNum> cancels a specific patient', async () => {
    session.getSession.mockReturnValue({
      step: 'ADMIN_DASHBOARD',
      adminDoctorId: 'doc-1',
      patients: MOCK_PATIENTS,
    });
    adminService.updateAppointmentStatus.mockResolvedValue(true);

    const reply = await handleAdminFlow('999', '/cancel 2', 'sch-1');

    expect(reply).toContain('2');
    expect(adminService.updateAppointmentStatus).toHaveBeenCalledWith('bk-2', 'Cancelled');
  });
});
