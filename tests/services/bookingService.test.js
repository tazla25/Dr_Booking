// tests/services/bookingService.test.js
const { AppointmentError } = require('../../src/utils/errors');
const { createBooking, getQueueStatus, cancelBookingByToken, rescheduleBookingByToken } = require('../../src/services/bookingService');

jest.mock('../../src/database/prisma', () => ({
  schedule: {
    findUnique: jest.fn()
  },
  appointment: {
    aggregate: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn()
  }
}));

const prisma = require('../../src/database/prisma');

describe('bookingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    it('creates booking and returns queue number 1 when no prior bookings', async () => {
      prisma.schedule.findUnique.mockResolvedValueOnce({ id: 'sch-1', doctorId: 'doc-1' });
      prisma.appointment.aggregate.mockResolvedValueOnce({ _max: { queueNumber: null } });
      prisma.appointment.create.mockResolvedValueOnce({
        patientName: 'Rina',
        patientPhone: '017',
        scheduleId: 'sch-1',
        appointmentDate: '2023-10-10',
        queueNumber: 1
      });

      const result = await createBooking({
        patientName: 'Rina',
        patientPhone: '017',
        scheduleId: 'sch-1',
        appointmentDate: '2023-10-10',
      });

      expect(result.queueNumber).toBe(1);
      expect(prisma.appointment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ queueNumber: 1 })
      });
    });

    it('throws when insert fails', async () => {
      prisma.schedule.findUnique.mockResolvedValueOnce({ id: 'sch-1', doctorId: 'doc-1' });
      prisma.appointment.aggregate.mockResolvedValueOnce({ _max: { queueNumber: null } });
      prisma.appointment.create.mockRejectedValueOnce(new Error('Insert failed'));

      await expect(
        createBooking({
          patientName: 'Rina',
          patientPhone: '017',
          scheduleId: 'sch-1',
          appointmentDate: '2023-10-10',
        })
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('getQueueStatus', () => {
    it('returns currentToken=2 and 1 pending patient', async () => {
      prisma.appointment.findMany.mockResolvedValueOnce([
        { queueNumber: 1, status: 'Completed', patientName: 'A' },
        { queueNumber: 2, status: 'Completed', patientName: 'B' },
        { queueNumber: 3, status: 'Confirmed', patientName: 'C' },
      ]);

      const result = await getQueueStatus('sch-1', '2023-10-10');
      expect(result.currentToken).toBe(2);
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].queueNumber).toBe(3);
    });

    it('returns currentToken=0 when no completed patients', async () => {
      prisma.appointment.findMany.mockResolvedValueOnce([
        { queueNumber: 1, status: 'Confirmed', patientName: 'A' },
      ]);

      const result = await getQueueStatus('sch-1', '2023-10-10');
      expect(result.currentToken).toBe(0);
      expect(result.pending).toHaveLength(1);
    });
  });
});
