const express = require('express');
const request = require('supertest');
const { rateLimit } = require('../src/middleware/rate-limiter.middleware');
const redisService = require('../src/services/redis.service');
const { getRedisClient, disconnectRedis } = require('../src/config/redis');

describe('Phase 7.2 — Distributed Rate Limiting', () => {
  let app;

  beforeAll(async () => {
    const client = getRedisClient();
    if (client.status !== 'ready') {
      await new Promise((resolve) => {
        let timer;
        const onDone = () => {
          clearTimeout(timer);
          client.removeListener('ready', onDone);
          client.removeListener('error', onDone);
          resolve();
        };
        client.once('ready', onDone);
        client.once('error', onDone);
        timer = setTimeout(onDone, 1500);
      });
    }
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should allow requests under the limit and set proper headers', async () => {
    const prefix = `test_${Date.now()}`;
    const limiter = rateLimit({ max: 5, windowSec: 60, prefix });
    app.get('/test', limiter, (_req, res) => res.json({ success: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['ratelimit-limit']).toBe('5');
    expect(res.headers['ratelimit-remaining']).toBe('4');
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('should block requests exceeding the limit with 429 Too Many Requests', async () => {
    const prefix = `test_block_${Date.now()}`;
    const limiter = rateLimit({ max: 2, windowSec: 60, prefix });
    app.get('/test-block', limiter, (_req, res) => res.json({ success: true }));

    // Request 1
    const res1 = await request(app).get('/test-block');
    expect(res1.status).toBe(200);

    // Request 2
    const res2 = await request(app).get('/test-block');
    expect(res2.status).toBe(200);

    // Request 3 (exceeds limit 2)
    const res3 = await request(app).get('/test-block');
    expect(res3.status).toBe(429);
    expect(res3.body.success).toBe(false);
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res3.body.error.message).toContain('Too many requests');
    expect(res3.headers['retry-after']).toBeDefined();
    expect(res3.headers['ratelimit-remaining']).toBe('0');
  });

  it('should isolate rate limits between different users', async () => {
    const prefix = `test_user_iso_${Date.now()}`;
    const limiter = rateLimit({ max: 1, windowSec: 60, prefix });

    app.get(
      '/test-user',
      (req, _res, next) => {
        req.user = { id: req.headers['x-user-id'] || 'user-1' };
        next();
      },
      limiter,
      (_req, res) => res.json({ success: true })
    );

    // User 1 - Request 1 (allowed)
    const res1 = await request(app).get('/test-user').set('X-User-Id', 'user-1');
    expect(res1.status).toBe(200);

    // User 1 - Request 2 (blocked)
    const res2 = await request(app).get('/test-user').set('X-User-Id', 'user-1');
    expect(res2.status).toBe(429);

    // User 2 - Request 1 (allowed - independent limit)
    const res3 = await request(app).get('/test-user').set('X-User-Id', 'user-2');
    expect(res3.status).toBe(200);
  });

  it('should isolate rate limits between different custom keys / IPs', async () => {
    const prefix = `test_ip_iso_${Date.now()}`;
    const limiter = rateLimit({
      max: 1,
      windowSec: 60,
      prefix,
      keyFn: (req) => `ip:${req.headers['x-client-ip'] || '127.0.0.1'}`,
    });

    app.get('/test-ip', limiter, (_req, res) => res.json({ success: true }));

    // IP 1: req 1 (ok)
    const res1 = await request(app).get('/test-ip').set('X-Client-IP', '192.168.1.1');
    expect(res1.status).toBe(200);

    // IP 1: req 2 (blocked)
    const res2 = await request(app).get('/test-ip').set('X-Client-IP', '192.168.1.1');
    expect(res2.status).toBe(429);

    // IP 2: req 1 (ok)
    const res3 = await request(app).get('/test-ip').set('X-Client-IP', '192.168.1.2');
    expect(res3.status).toBe(200);
  });

  it('should fail-open gracefully when Redis increment returns null (Redis down/error)', async () => {
    const originalIncrement = redisService.increment;
    redisService.increment = jest.fn().mockResolvedValue(null);

    const limiter = rateLimit({ max: 1, windowSec: 60, prefix: 'test_fail_open' });
    app.get('/test-fail-open', limiter, (_req, res) => res.json({ success: true, failOpen: true }));

    const res = await request(app).get('/test-fail-open');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    redisService.increment = originalIncrement;
  });
});

