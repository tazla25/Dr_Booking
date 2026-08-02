describe('Dashboard API Integration Tests', () => {
  const BASE_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

  describe('Auth Flow', () => {
    it('should fail verification with invalid token', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid_token' })
      });
      
      const data = await res.json();
      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
    });
  });

  describe('Appointments API', () => {
    it('should return unauthorized when fetching appointments without session', async () => {
      const res = await fetch(`${BASE_URL}/api/appointments`);
      expect(res.status).toBe(401);
    });
  });
});
