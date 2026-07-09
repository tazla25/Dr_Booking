// tests/services/bookingService.test.js
const { createBooking, getQueueStatus } = require('../../src/services/bookingService');

jest.mock('../../src/database/supabase', () => {
  const mock = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };
  return mock;
});

const supabase = require('../../src/database/supabase');

describe('createBooking', () => {
  it('creates booking and returns queue number 1 when no prior bookings', async () => {
    // First call: count query, ends in eq()
    supabase.eq
      .mockReturnValueOnce(supabase) // first eq
      .mockResolvedValueOnce({ count: 0, error: null }); // second eq

    // Second call: insert result
    supabase.single
      .mockResolvedValueOnce({
        data: {
          booking_id: 'bk-1',
          patient_name: 'Rahul Das',
          patient_phone: '9876543210',
          queue_number: 1,
          status: 'Confirmed',
          appointment_date: '2026-07-10',
        },
        error: null,
      });

    const result = await createBooking({
      patientName: 'Rahul Das',
      patientPhone: '9876543210',
      scheduleId: 'sch-1',
      appointmentDate: '2026-07-10',
    });

    expect(result.queue_number).toBe(1);
    expect(result.patient_name).toBe('Rahul Das');
    expect(result.status).toBe('Confirmed');
  });

  it('throws when insert fails', async () => {
    supabase.eq
      .mockReturnValueOnce(supabase)
      .mockResolvedValueOnce({ count: 0, error: null });

    supabase.single
      .mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } });

    await expect(
      createBooking({
        patientName: 'Test',
        patientPhone: '123',
        scheduleId: 'sch-1',
        appointmentDate: '2026-07-10',
      })
    ).rejects.toThrow('Insert failed');
  });
});

describe('getQueueStatus', () => {
  it('returns currentToken=2 and 1 pending patient', async () => {
    supabase.order.mockResolvedValueOnce({
      data: [
        { queue_number: 1, status: 'Completed', patient_name: 'Alice' },
        { queue_number: 2, status: 'Completed', patient_name: 'Bob' },
        { queue_number: 3, status: 'Confirmed', patient_name: 'Carol' },
      ],
      error: null,
    });

    const result = await getQueueStatus('sch-1', '2026-07-10');
    expect(result.currentToken).toBe(2);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].queue_number).toBe(3);
  });

  it('returns currentToken=0 when no completed patients', async () => {
    supabase.order.mockResolvedValueOnce({
      data: [{ queue_number: 1, status: 'Confirmed', patient_name: 'Alice' }],
      error: null,
    });

    const result = await getQueueStatus('sch-1', '2026-07-10');
    expect(result.currentToken).toBe(0);
    expect(result.pending).toHaveLength(1);
  });
});
