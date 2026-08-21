const request = require('supertest');
const app = require('../src/app');
const { disconnectDatabase } = require('./setup');

describe('Health Check Endpoints', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('GET /health', () => {
    it('should return 200 with liveness metadata', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.uptime).toBeDefined();
      expect(res.body.data.version).toBe('0.2.0');
      expect(res.body.data.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness check for database and redis', async () => {
      const res = await request(app)
        .get('/health/ready');

      expect(res.body.data).toBeDefined();
      expect(res.body.data.checks).toBeDefined();
      expect(res.body.data.checks.database).toBeDefined();
      expect(res.body.data.checks.redis).toBeDefined();
    });
  });
});
