// tests/services/adminService.test.js
const {
  verifyAdminPin,
  getTodaysPatients,
  updateAppointmentStatus,
} = require('../../src/services/adminService');

jest.mock('../../src/database/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn(),
}));

const supabase = require('../../src/database/supabase');

describe('verifyAdminPin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctor_id when PIN matches', async () => {
    supabase.single.mockResolvedValueOnce({
      data: { doctor_id: 'doc-1', secret_pin: '1234' },
      error: null,
    });

    const result = await verifyAdminPin('1234', 'chat-1');
    expect(result).toBe('doc-1');
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it('returns null when PIN does not match and logs attempt', async () => {
    supabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'No rows returned' },
    });

    supabase.insert.mockResolvedValueOnce({ error: null });

    const result = await verifyAdminPin('9999', 'chat-1');
    expect(result).toBeNull();

    expect(supabase.from).toHaveBeenCalledWith('failed_login_attempts');
    expect(supabase.insert).toHaveBeenCalledWith({
      chat_id: 'chat-1',
      attempted_pin: '9999'
    });
  });
});

describe('getTodaysPatients', () => {
  it('returns ordered patient list', async () => {
    supabase.order.mockResolvedValueOnce({
      data: [
        { booking_id: 'bk-1', patient_name: 'Rina', queue_number: 1, status: 'Confirmed' },
        { booking_id: 'bk-2', patient_name: 'Sumon', queue_number: 2, status: 'Confirmed' },
      ],
      error: null,
    });

    const result = await getTodaysPatients('sch-1');
    expect(result).toHaveLength(2);
    expect(result[0].patient_name).toBe('Rina');
  });

  it('returns empty array when no patients', async () => {
    supabase.order.mockResolvedValueOnce({ data: [], error: null });
    const result = await getTodaysPatients('sch-1');
    expect(result).toEqual([]);
  });
});

describe('updateAppointmentStatus', () => {
  it('returns true on successful update', async () => {
    supabase.eq.mockResolvedValueOnce({ error: null });
    const result = await updateAppointmentStatus('bk-1', 'Completed');
    expect(result).toBe(true);
  });

  it('throws when update fails', async () => {
    supabase.eq.mockResolvedValueOnce({ error: { message: 'Update failed' } });
    await expect(updateAppointmentStatus('bk-1', 'Completed')).rejects.toThrow(
      'Update failed'
    );
  });
});
