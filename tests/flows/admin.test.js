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
  },
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
        adminUser: { ownedDoctor: { id: 'doc-1' }, delegatedDoctorId: null },
        magicLink: 'http://localhost:3000/auth/verify?token=123'
      });

      const reply = await handleAdminFlow('999', '/admin', 'sch-1');

      expect(reply.text || reply).toContain('লগইন সফল');
      expect(reply.options.reply_markup.inline_keyboard[0][0].url).toBe('http://localhost:3000/auth/verify?token=123');
      // The new flow uses ownedDoctor.id or delegatedDoctorId
      expect(session.setSession).toHaveBeenCalledWith(
        '999',
        expect.objectContaining({ step: 'ADMIN_DASHBOARD' })
      );
    });

    it('returns error message when handleAdminAuth returns null (user not found)', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue(null);

      const reply = await handleAdminFlow('999', '/admin', 'sch-1');

      // The flow returns the localized ERROR message
      const replyText = typeof reply === 'string' ? reply : reply.text;
      expect(replyText).toBeTruthy(); // Some error message is returned
    });

    it('returns verification-pending message when doctor is not verified', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });
      adminService.handleAdminAuth.mockResolvedValue({
        adminUser: { id: 'au-1', role: 'DOCTOR', verificationStatus: 'PENDING' },
        magicLink: null,
        reason: 'PENDING',
      });

      const reply = await handleAdminFlow('999', '/admin', 'sch-1');
      const replyText = typeof reply === 'string' ? reply : reply.text;
      // Bengali message for "not verified yet"
      expect(replyText).toContain('যাচাই');
    });
  });
});
