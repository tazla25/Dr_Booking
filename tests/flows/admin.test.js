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

    describe('ADMIN_START step (v11 phone+password login)', () => {
    it('prompts for phone number and advances session to LOGIN_PHONE', async () => {
      session.getSession.mockResolvedValue({ step: 'ADMIN_START' });

      const reply = await handleAdminFlow(mockBot, '999', '/admin', 'sch-1');

      const replyText = typeof reply === 'string' ? reply : reply.text;
      expect(replyText).toContain('লগইন করুন');
      expect(session.setSession).toHaveBeenCalledWith(
        '999',
        expect.objectContaining({ step: 'LOGIN_PHONE' })
      );
    });

    it('prompts for phone number even if command is /login', async () => {
      session.getSession.mockResolvedValue({ step: 'IDLE' });

      const reply = await handleAdminFlow(mockBot, '999', '/login', 'sch-1');

      const replyText = typeof reply === 'string' ? reply : reply.text;
      expect(replyText).toContain('লগইন করুন');
      expect(session.setSession).toHaveBeenCalledWith(
        '999',
        expect.objectContaining({ step: 'LOGIN_PHONE' })
      );
    });
  });
});
