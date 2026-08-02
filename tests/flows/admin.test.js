jest.mock('../../src/database/prisma', () => ({
  rateLimitEntry: {
    deleteMany: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ hits: 1, expiresAt: new Date(Date.now() + 300000) }),
    update: jest.fn(),
    delete: jest.fn()
  }
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

  describe('ADMIN_START step', () => {
    it('shows magic link on valid adminUser', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue({
        adminUser: { doctorId: 'doc-1' },
        magicLink: 'http://localhost:3000/auth/verify?token=123'
      });

      const reply = await handleAdminFlow('999', '/admin', 'sch-1');

      expect(reply.text || reply).toContain('লগইন সফল');
      expect(reply.options.reply_markup.inline_keyboard[0][0].url).toBe('http://localhost:3000/auth/verify?token=123');
      expect(session.setSession).toHaveBeenCalledWith('999', { step: 'ADMIN_DASHBOARD', doctorId: 'doc-1' });
    });

    it('returns error on invalid adminUser', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue(null);

      const reply = await handleAdminFlow('999', '/admin', 'sch-1');

      expect(reply.text || reply).toContain('You are not registered as an admin');
    });
  });
});
