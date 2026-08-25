const request = require('supertest');
const app = require('../src/app');

describe('Phase 10.6 — Production Security & Headers', () => {
  it('should include standard Helmet security headers on HTTP responses', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should handle invalid JSON payloads without crashing or leaking stack traces', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"malformed": invalid_json}');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.stack).toBeUndefined();
  });
});
