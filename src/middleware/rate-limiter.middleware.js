const redisService = require('../services/redis.service');
const { logger } = require('../config/logger');

// ============================================================
// Distributed Rate Limiter Middleware
// ============================================================
// Redis-backed sliding counter rate limiter. Works consistently across
// multi-instance cluster deployments because counters live in Redis.
//
// Features:
//   - Tiered limits (general API vs heavy RAG operations)
//   - Per-IP or Per-Authenticated-User tracking
//   - Standard RateLimit-* headers
//   - Safe fail-open degradation if Redis connection is unavailable
//
// Headers returned:
//   RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After

/**
 * Create a rate-limiting middleware.
 * @param {object} options
 * @param {number}   [options.max]          - Maximum requests allowed in the window
 * @param {number}   [options.maxRequests]  - Alias for max
 * @param {number}   [options.windowSec]    - Window size in seconds
 * @param {number}   [options.windowMs]     - Window size in milliseconds
 * @param {string}   [options.prefix]       - Key prefix for this limiter tier
 * @param {Function} [options.keyFn]        - (req) => string — custom key extractor
 * @returns {import('express').RequestHandler}
 */
function rateLimit({
  max,
  maxRequests,
  windowSec,
  windowMs,
  prefix = 'global',
  keyFn,
} = {}) {
  const limitMax = max || maxRequests || 100;
  const limitWindowSec = windowSec || (windowMs ? Math.ceil(windowMs / 1000) : 900);

  return async (req, res, next) => {
    try {
      // Build rate limiting identifier
      let identifier;
      if (keyFn) {
        identifier = keyFn(req);
      } else if (req.user && req.user.id) {
        identifier = `user:${req.user.id}`;
      } else {
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        identifier = `ip:${clientIp}`;
      }

      const key = redisService.buildKey('ratelimit', prefix, identifier);
      const result = await redisService.increment(key, limitWindowSec);

      // If Redis is down, fail-open — allow the request and log
      if (!result) {
        return next();
      }

      const { count, ttl } = result;
      const remaining = Math.max(0, limitMax - count);
      const resetSeconds = ttl > 0 ? ttl : limitWindowSec;

      // Set standard rate-limit headers
      res.setHeader('RateLimit-Limit', limitMax);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetSeconds);

      if (count > limitMax) {
        logger.warn(
          {
            requestId: req.id || req.requestId,
            identifier,
            prefix,
            count,
            max: limitMax,
            resetSeconds,
          },
          'Rate limit exceeded'
        );

        res.setHeader('Retry-After', resetSeconds);
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter: resetSeconds,
          },
        });
      }

      next();
    } catch (err) {
      // On unexpected error, fail-open so application remains available
      logger.warn({ error: err.message }, 'Rate limiter fail-open on error');
      next();
    }
  };
}

module.exports = { rateLimit };

