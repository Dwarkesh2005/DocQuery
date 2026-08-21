const redisService = require('../services/redis.service');
const { logger } = require('../config/logger');

// ============================================================
// Distributed Rate Limiter Middleware
// ============================================================
// Redis-backed sliding window counter. Works correctly across
// multiple backend instances because all counters live in Redis.
//
// If Redis is unavailable, rate limiting is bypassed (fail-open)
// to avoid blocking legitimate traffic due to infrastructure
// issues.
//
// Returns standard rate-limit headers:
//   RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After

/**
 * Create a rate-limiting middleware.
 * @param {object} options
 * @param {number}   options.max      - Maximum requests allowed in the window
 * @param {number}   options.windowSec - Window size in seconds
 * @param {string}   [options.prefix]  - Key prefix for this limiter tier
 * @param {Function} [options.keyFn]   - (req) => string — custom key extractor
 * @returns {import('express').RequestHandler}
 */
function rateLimit({ max, windowSec, prefix = 'global', keyFn }) {
  return async (req, res, next) => {
    try {
      // Build identifier: user ID if authenticated, otherwise IP
      let identifier;
      if (keyFn) {
        identifier = keyFn(req);
      } else if (req.user) {
        identifier = `user:${req.user.id}`;
      } else {
        identifier = `ip:${req.ip}`;
      }

      const key = redisService.buildKey('ratelimit', prefix, identifier);
      const result = await redisService.increment(key, windowSec);

      // If Redis is down, fail-open — allow the request
      if (!result) return next();

      const { count, ttl } = result;
      const remaining = Math.max(0, max - count);

      // Set standard rate-limit headers
      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', ttl);

      if (count > max) {
        logger.warn({
          requestId: req.id,
          identifier,
          prefix,
          count,
          max,
        }, 'Rate limit exceeded');

        res.setHeader('Retry-After', ttl);
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter: ttl,
          },
        });
      }

      next();
    } catch {
      // On error, fail-open
      next();
    }
  };
}

module.exports = { rateLimit };
