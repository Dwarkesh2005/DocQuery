const redisService = require('../services/redis.service');

// ============================================================
// Cache-Aside Middleware
// ============================================================
// Generic Express middleware implementing the Cache-Aside
// (lazy-loading) pattern with Redis.
//
// Flow:
//   Request → Check Redis → HIT → Return cached data
//                         → MISS → Next handler → Store in Redis
//
// Adds X-Cache header: HIT or MISS
// Tenant-isolated: cache keys include userId and/or organizationId

/**
 * Create a cache-aside middleware.
 * @param {object} options
 * @param {Function} options.keyFn - (req) => string — builds the cache key
 * @param {number}   options.ttl  - TTL in seconds (default: 300 = 5 min)
 * @returns {import('express').RequestHandler}
 */
function cacheAside({ keyFn, ttl = 300 }) {
  return async (req, res, next) => {
    try {
      const cacheKey = keyFn(req);
      if (!cacheKey) return next();

      const cached = await redisService.get(cacheKey);

      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached);
      }

      // Cache MISS — intercept res.json to store the response
      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisService.set(cacheKey, body, ttl).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch {
      // On cache errors, proceed without caching
      next();
    }
  };
}

module.exports = { cacheAside };
