const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/database');

describe('Phase 10.1 — Health Check & Probe APIs', () => {
  describe('GET /health/live (Liveness Probe)', () => {
    it('should return 200 OK immediately with process status and uptime', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready (Readiness Probe)', () => {
    it('should return 200 OK when database is accessible', async () => {
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.checks.database.status).toBe('healthy');
    });

    it('should return 503 Service Unavailable when database query fails', async () => {
      const originalQuery = prisma.$queryRaw;
      prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('DB connection lost'));

      try {
        const res = await request(app).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.data.status).toBe('not_ready');
        expect(res.body.data.checks.database.status).toBe('unhealthy');
      } finally {
        prisma.$queryRaw = originalQuery;
      }
    });
  });

  describe('GET /health (Detailed Health Status)', () => {
    it('should return comprehensive system status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBeDefined();
      expect(res.body.data.dependencies.database).toBe('healthy');
    });
  });
});
