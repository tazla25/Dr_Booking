// tests/services/adminService.test.js
const {
  handleAdminAuth,
  getTodaysPatients,
  updateAppointmentStatus,
} = require('../../src/services/adminService');

jest.mock('../../src/database/prisma', () => ({
  adminUser: {
    findUnique: jest.fn()
  },
  appointment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  }
}));

const prisma = require('../../src/database/prisma');

describe('handleAdminAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns adminUser and magicLink when found', async () => {
    prisma.adminUser.findUnique.mockResolvedValueOnce({ id: 'au-1', telegramChatId: 'chat-1' });
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ magicLink: 'http://link' }) }));
    
    const result = await handleAdminAuth('chat-1');
    expect(result.magicLink).toBe('http://link');
    expect(result.adminUser.id).toBe('au-1');
  });

  it('returns null when user not found', async () => {
    prisma.adminUser.findUnique.mockResolvedValueOnce(null);

    const result = await handleAdminAuth('chat-1');
    expect(result).toBeNull();
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
    expect(result[0].patientName).toBe('Rina');
    expect(result[0].id).toBe('bk-1');
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
    prisma.appointment.findUnique.mockResolvedValueOnce({ id: 'bk-1', doctorId: 'doc-1' });
    prisma.appointment.update.mockResolvedValueOnce({});
    const result = await updateAppointmentStatus('bk-1', 'Completed', 'doc-1');
    expect(result).toBe(true);
  });

  it('throws when update fails', async () => {
    prisma.appointment.findUnique.mockResolvedValueOnce({ id: 'bk-1', doctorId: 'doc-1' });
    prisma.appointment.update.mockRejectedValueOnce(new Error('Update failed'));
    await expect(updateAppointmentStatus('bk-1', 'Completed', 'doc-1')).rejects.toThrow(
      'Update failed'
    );
  });
});
