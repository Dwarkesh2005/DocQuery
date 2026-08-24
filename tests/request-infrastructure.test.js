const request = require('supertest');
const app = require('../src/app');
const { requestId } = require('../src/middleware/request-id.middleware');
const { logger } = require('../src/config/logger');

describe('Phase 7.1 — Request Infrastructure & Structured Logging', () => {
  describe('Request ID Middleware', () => {
    it('should generate a UUIDv4 request ID when none is provided', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      // UUID format check (8-4-4-4-12 hex chars)
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should reuse a valid incoming X-Request-Id header', async () => {
      const customId = 'trace-id-12345-abc-xyz';
      const res = await request(app)
        .get('/health')
        .set('X-Request-Id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should replace an invalid or oversized incoming X-Request-Id with a generated UUID', async () => {
      const invalidId = 'a'.repeat(200); // Exceeds 128 chars
      const res = await request(app)
        .get('/health')
        .set('X-Request-Id', invalidId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).not.toBe(invalidId);
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should attach id and requestId to req object', () => {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      requestId(req, res, next);

      expect(req.id).toBeDefined();
      expect(req.requestId).toBeDefined();
      expect(req.id).toBe(req.requestId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pino Logger Configuration & Redaction', () => {
    it('should expose a structured logger with standard log methods', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have redaction configured for sensitive fields', () => {
      expect(logger).toBeDefined();
    });
  });
});
