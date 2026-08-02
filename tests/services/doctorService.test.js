// tests/services/doctorService.test.js
const { getDoctorsByPin, getSchedulesForDoctor } = require('../../src/services/doctorService');

jest.mock('../../src/database/prisma', () => ({
  schedule: {
    findMany: jest.fn()
  }
}));

const prisma = require('../../src/database/prisma');

describe('doctorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDoctorsByPin', () => {
    it('returns list of doctors for a valid PIN code', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([
        {
          pinCode: 1234,
          doctorId: 'doc-1',
          doctor: { id: 'doc-1', fullName: 'Dr. Smith' }
        }
      ]);

      const result = await getDoctorsByPin('1234');
      expect(result).toHaveLength(1);
      expect(result[0].doctor.fullName).toBe('Dr. Smith');
      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: { pinCode: 1234 },
        include: { doctor: true }
      });
    });

    it('returns empty array when no doctors found', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([]);

      const result = await getDoctorsByPin('9999');
      expect(result).toEqual([]);
    });

    it('throws when database returns an error', async () => {
      prisma.schedule.findMany.mockRejectedValueOnce(new Error('DB error'));

      await expect(getDoctorsByPin('1234')).rejects.toThrow('DB error');
    });
  });
});
