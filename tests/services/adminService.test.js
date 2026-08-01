// tests/services/adminService.test.js
const {
  verifyAdminPin,
  getTodaysPatients,
  updateAppointmentStatus,
} = require('../../src/services/adminService');

jest.mock('../../src/database/prisma', () => ({
  schedule: {
    findFirst: jest.fn()
  },
  failedLogin: {
    create: jest.fn()
  },
  appointment: {
    findMany: jest.fn(),
    update: jest.fn()
  }
}));

const prisma = require('../../src/database/prisma');

describe('verifyAdminPin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctor_id when PIN matches', async () => {
    prisma.schedule.findFirst.mockResolvedValueOnce({
      id: 'sch-1',
      doctorId: 'doc-1',
      pinCode: 1234,
      doctor: { id: 'doc-1' }
    });

    const result = await verifyAdminPin('1234', 'chat-1');
    expect(result).toEqual({ doctor_id: 'doc-1', schedule_id: 'sch-1' });
    expect(prisma.failedLogin.create).not.toHaveBeenCalled();
  });

  it('returns null when PIN does not match and logs attempt', async () => {
    prisma.schedule.findFirst.mockResolvedValueOnce(null);
    prisma.failedLogin.create.mockResolvedValueOnce({});

    const result = await verifyAdminPin('9999', 'chat-1');
    expect(result).toBeNull();

    expect(prisma.failedLogin.create).toHaveBeenCalledWith({
      data: {
        email: 'bot-chat-chat-1',
        ipAddress: '9999'
      }
    });
  });
});

describe('getTodaysPatients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ordered patient list', async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([
      { id: 'bk-1', patientName: 'Rina', queueNumber: 1, status: 'Confirmed' },
      { id: 'bk-2', patientName: 'Sumon', queueNumber: 2, status: 'Confirmed' },
    ]);

    const result = await getTodaysPatients('sch-1');
    expect(result).toHaveLength(2);
    expect(result[0].patient_name).toBe('Rina');
    expect(result[0].booking_id).toBe('bk-1');
  });

  it('returns empty array when no patients', async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([]);
    const result = await getTodaysPatients('sch-1');
    expect(result).toEqual([]);
  });
});

describe('updateAppointmentStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true on successful update', async () => {
    prisma.appointment.update.mockResolvedValueOnce({});
    const result = await updateAppointmentStatus('bk-1', 'Completed');
    expect(result).toBe(true);
  });

  it('throws when update fails', async () => {
    prisma.appointment.update.mockRejectedValueOnce(new Error('Update failed'));
    await expect(updateAppointmentStatus('bk-1', 'Completed')).rejects.toThrow(
      'Update failed'
    );
  });
});
