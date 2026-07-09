// tests/services/doctorService.test.js
const { getDoctorsByPin, getSchedulesForDoctor } = require('../../src/services/doctorService');

jest.mock('../../src/database/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}));

const supabase = require('../../src/database/supabase');

describe('getDoctorsByPin', () => {
  it('returns list of doctors for a valid PIN code', async () => {
    supabase.eq.mockResolvedValueOnce({
      data: [
        {
          schedule_id: 'sch-1',
          pin_code: 700001,
          day_of_week: 'Wednesday',
          start_time: '10:00',
          end_time: '14:00',
          doctors: { full_name: 'Dr. Arjun Sen', specialization: 'Optometry' },
        },
      ],
      error: null,
    });

    const result = await getDoctorsByPin(700001);
    expect(result).toHaveLength(1);
    expect(result[0].doctors.full_name).toBe('Dr. Arjun Sen');
  });

  it('returns empty array when no doctors found', async () => {
    supabase.eq.mockResolvedValueOnce({ data: [], error: null });
    const result = await getDoctorsByPin(999999);
    expect(result).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    supabase.eq.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(getDoctorsByPin(700001)).rejects.toThrow('DB error');
  });
});
