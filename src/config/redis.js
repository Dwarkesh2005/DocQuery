const Redis = require('ioredis');
const { env } = require('./env');

// ============================================================
// Redis Singleton Client
// ============================================================
// Provides a single Redis connection used for caching, rate
// limiting, and BullMQ queues. Designed for fail-open
// degradation: if Redis is unavailable the app continues
// operating (cache misses, in-memory fallbacks) instead of
// crashing.

let redis = null;
let isReady = false;

/**
 * Create and return the singleton Redis client.
 * Safe to call multiple times — returns the existing instance.
 */
function getRedisClient() {
  if (redis) return redis;

  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,   // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times) {
      // Exponential backoff capped at 5 seconds
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    reconnectOnError(err) {
      // Reconnect on READONLY errors (e.g. failover)
      const targetErrors = ['READONLY'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  redis.on('connect', () => {
    if (env.NODE_ENV !== 'test') {
      console.log('✅ Redis connected');
    }
  });

  redis.on('ready', () => {
    isReady = true;
    if (env.NODE_ENV !== 'test') {
      console.log('✅ Redis ready');
    }
  });

  redis.on('error', (err) => {
    isReady = false;
    if (env.NODE_ENV !== 'test') {
      console.error('❌ Redis error:', err.message);
    }
  });

  redis.on('close', () => {
    isReady = false;
  });

  return redis;
}

/**
 * Check if the Redis client is connected and ready.
 * @returns {boolean}
 */
function isRedisReady() {
  return isReady && redis !== null && redis.status === 'ready';
}

/**
 * Gracefully disconnect Redis.
 */
async function disconnectRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    isReady = false;
  }
}

module.exports = { getRedisClient, isRedisReady, disconnectRedis };
