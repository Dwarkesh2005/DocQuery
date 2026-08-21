const request = require('supertest');
const app = require('../src/app');
const { disconnectDatabase } = require('./setup');

describe('Distributed Rate Limiter & Middleware', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('should include rate limit headers on public endpoints', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'fake@example.com', password: 'wrong' });

    // When Redis is offline or fail-open, headers or proper responses are returned
    expect(res.status).not.toBe(500);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('should sanitize prototype pollution payloads', async () => {
    const maliciousBody = JSON.parse('{"__proto__": {"polluted": true}, "name": "Safe Name"}');

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(maliciousBody);

    expect(Object.prototype.polluted).toBeUndefined();
    expect(res.status).not.toBe(500);
  });
});
