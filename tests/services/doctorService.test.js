// tests/services/doctorService.test.js
const {
  getDoctorsByPin,
  getSchedulesForDoctor,
  searchDoctorsByName,
  searchDoctorsBySpecialty,
  searchDoctorsBySpecialtyAndPin,
} = require('../../src/services/doctorService');

jest.mock('../../src/database/prisma', () => ({
  schedule: {
    findMany: jest.fn(),
  },
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
          pinCode: 700001,
          doctorId: 'doc-1',
          doctor: { id: 'doc-1', fullName: 'Dr. Smith', ownerAdmin: { role: 'DOCTOR', verificationStatus: 'VERIFIED' } },
        },
      ]);

      const result = await getDoctorsByPin('700001');
      expect(result).toHaveLength(1);
      expect(result[0].doctor.fullName).toBe('Dr. Smith');
      // New behavior: filters by doctor.ownerAdmin.verificationStatus === 'VERIFIED'
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pinCode: 700001,
            doctor: expect.objectContaining({
              isActive: true,
              ownerAdmin: expect.objectContaining({
                role: 'DOCTOR',
                verificationStatus: 'VERIFIED',
              }),
            }),
          }),
        })
      );
    });

    it('returns empty array when no doctors found', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([]);

      const result = await getDoctorsByPin('999999');
      expect(result).toEqual([]);
    });

    it('returns empty array for non-numeric PIN', async () => {
      const result = await getDoctorsByPin('abc');
      expect(result).toEqual([]);
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    });

    it('throws when database returns an error', async () => {
      prisma.schedule.findMany.mockRejectedValueOnce(new Error('DB error'));

      await expect(getDoctorsByPin('700001')).rejects.toThrow('DB error');
    });
  });

  describe('searchDoctorsByName', () => {
    it('returns matching doctors for a name query', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([
        { doctor: { fullName: 'Dr. Arjun Sen' }, clinicName: 'Clinic A' },
      ]);

      const result = await searchDoctorsByName('Sen');
      expect(result).toHaveLength(1);
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctor: expect.objectContaining({
              fullName: { contains: 'Sen', mode: 'insensitive' },
            }),
          }),
        })
      );
    });

    it('returns empty array for queries shorter than 2 chars', async () => {
      const result = await searchDoctorsByName('S');
      expect(result).toEqual([]);
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    });
  });

  describe('searchDoctorsBySpecialty', () => {
    it('returns matching doctors for specialty + city', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([
        { doctor: { fullName: 'Dr. Heart' }, clinicName: 'Heart Clinic' },
      ]);

      const result = await searchDoctorsBySpecialty('Cardiologist', 'Kolkata');
      expect(result).toHaveLength(1);
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctor: expect.objectContaining({
              specialization: { contains: 'Cardiologist', mode: 'insensitive' },
            }),
            OR: expect.arrayContaining([
              expect.objectContaining({ clinicName: { contains: 'Kolkata', mode: 'insensitive' } }),
              expect.objectContaining({ clinicAddress: { contains: 'Kolkata', mode: 'insensitive' } }),
            ]),
          }),
        })
      );
    });

    it('works without a city filter', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([]);

      await searchDoctorsBySpecialty('Cardiologist');
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ OR: expect.anything() }),
        })
      );
    });

    it('returns empty array for specialty shorter than 3 chars', async () => {
      const result = await searchDoctorsBySpecialty('Ca');
      expect(result).toEqual([]);
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    });
  });

  describe('searchDoctorsBySpecialtyAndPin', () => {
    it('returns matching doctors for specialty + PIN', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([
        { doctor: { fullName: 'Dr. Heart' } },
      ]);

      const result = await searchDoctorsBySpecialtyAndPin('Cardiologist', '700001');
      expect(result).toHaveLength(1);
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pinCode: 700001,
            doctor: expect.objectContaining({
              specialization: { contains: 'Cardiologist', mode: 'insensitive' },
            }),
          }),
        })
      );
    });

    it('returns empty array for invalid PIN', async () => {
      const result = await searchDoctorsBySpecialtyAndPin('Cardiologist', 'abc');
      expect(result).toEqual([]);
      expect(prisma.schedule.findMany).not.toHaveBeenCalled();
    });
  });
});
