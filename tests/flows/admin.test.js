
jest.mock('../../src/database/supabase', () => ({
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
    it('shows magic link on correct PIN', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_AWAITING_PIN' });
      adminService.verifyAdminPin.mockResolvedValue({
        doctor_id: 'doc-1',
        schedule_id: 'sch-1',
      });

      const reply = await handleAdminFlow('999', '1234', 'sch-1');

      expect(reply.text || reply).toContain('লগইন সফল');
      expect(session.clearSession).toHaveBeenCalledWith('999');
    });

    it('returns invalid PIN message on wrong PIN', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_AWAITING_PIN' });
      adminService.verifyAdminPin.mockResolvedValue(null);

      const reply = await handleAdminFlow('999', '0000', 'sch-1');
      expect(reply.text || reply).toContain('ভুল');
    });
  });
});
