
jest.mock('../../src/database/prisma', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
}));
jest.mock('../../src/services/adminService'); // Mock first before any requires
jest.mock('../../src/bot/session');

const { handleAdminFlow } = require('../../src/flows/admin');
const session = require('../../src/bot/session');
const adminService = require('../../src/services/adminService');


describe('handleAdminFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ADMIN_AWAITING_PIN step', () => {
    it('shows magic link on correct PIN via fetch API', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_AWAITING_PIN' });
      adminService.verifyAdminPin.mockResolvedValue({
        doctor_id: 'doc-1',
        schedule_id: 'sch-1',
      });

      // Mock fetch
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ magicLink: 'http://localhost:3000/auth/verify?token=123' }),
        })
      );

      const reply = await handleAdminFlow('999', '1234', 'sch-1');

      expect(reply.text || reply).toContain('লগইন সফল');
      expect(reply.options.reply_markup.inline_keyboard[0][0].url).toBe('http://localhost:3000/auth/verify?token=123');
      expect(session.clearSession).toHaveBeenCalledWith('999');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('shows error if fetch API fails', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_AWAITING_PIN' });
      adminService.verifyAdminPin.mockResolvedValue({
        doctor_id: 'doc-1',
        schedule_id: 'sch-1',
      });

      // Mock fetch failure
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ message: 'Error generating link' }),
        })
      );

      const reply = await handleAdminFlow('999', '1234', 'sch-1');

      expect(reply.text || reply).toContain('ড্যাশবোর্ড লিঙ্ক তৈরি করতে সমস্যা হয়েছে');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns invalid PIN message on wrong PIN', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_AWAITING_PIN' });
      adminService.verifyAdminPin.mockResolvedValue(null);

      const reply = await handleAdminFlow('999', '0000', 'sch-1');
      expect(reply.text || reply).toContain('ভুল');
    });
  });
});
