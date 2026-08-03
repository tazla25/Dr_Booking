// tests/flows/admin.test.js
jest.mock('../../src/database/prisma', () => ({
  rateLimitEntry: {
    deleteMany: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ hits: 1, expiresAt: new Date(Date.now() + 300000) }),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({}), // Must return a Promise for .catch()
  },
  adminUser: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../src/services/adminService'); // Mock first before any requires
jest.mock('../../src/bot/session');

const { handleAdminFlow } = require('../../src/flows/admin');
const session = require('../../src/bot/session');
const adminService = require('../../src/services/adminService');

// Mock bot instance
const mockBot = { sendMessage: jest.fn() };

describe('handleAdminFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ADMIN_START step', () => {
    it('shows magic link on valid adminUser', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue({
        adminUser: { ownedDoctor: { id: 'doc-1' }, delegatedDoctorId: null },
        magicLink: 'http://localhost:3000/auth/verify?token=123'
      });

      // Bug 7/8 fix: first arg is now the bot instance
      const reply = await handleAdminFlow(mockBot, '999', '/admin', 'sch-1');

      expect(reply.text || reply).toContain('লগইন সফল');
      expect(reply.options.reply_markup.inline_keyboard[0][0].url).toBe('http://localhost:3000/auth/verify?token=123');
      expect(session.setSession).toHaveBeenCalledWith(
        '999',
        expect.objectContaining({ step: 'ADMIN_DASHBOARD' })
      );
    });

    it('returns ADMIN_NOT_REGISTERED message when handleAdminAuth returns null (Bug 1)', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue(null);

      const reply = await handleAdminFlow(mockBot, '999', '/admin', 'sch-1');

      // Bug 1 fix: should show "not registered" message, not generic error
      const replyText = typeof reply === 'string' ? reply : reply.text;
      expect(replyText).toContain('নিবন্ধিত নন');
    });

    it('returns ADMIN_LINK_FAILED message when link generation fails (Bug 2)', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue({
        adminUser: { id: 'au-1', role: 'DOCTOR', verificationStatus: 'VERIFIED' },
        magicLink: null,
        reason: 'LINK_FAILED',
      });

      const reply = await handleAdminFlow(mockBot, '999', '/admin', 'sch-1');
      const replyText = typeof reply === 'string' ? reply : reply.text;
      expect(replyText).toContain('ড্যাশবোর্ড লিঙ্ক তৈরি করতে সমস্যা');
    });

    it('returns verification-pending message when doctor is not verified', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue({
        adminUser: { id: 'au-1', role: 'DOCTOR', verificationStatus: 'PENDING' },
        magicLink: null,
        reason: 'PENDING',
      });

      const reply = await handleAdminFlow(mockBot, '999', '/admin', 'sch-1');
      const replyText = typeof reply === 'string' ? reply : reply.text;
      expect(replyText).toContain('যাচাই');
    });
  });
});
