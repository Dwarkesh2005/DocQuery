const { getRedisClient, isRedisReady } = require('../config/redis');

// ============================================================
// Redis Service — Clean Abstraction Layer
// ============================================================
// All Redis operations go through this module. Raw ioredis
// commands are never used directly in controllers or services.
//
// Every method is fail-safe: if Redis is down, operations
// return graceful defaults (null for gets, false for sets)
// instead of throwing, enabling cache-aside with automatic
// fallback to the database.

const KEY_PREFIX = 'docquery';

/**
 * Build a namespaced Redis key.
 * @param {...string} parts — key segments
 * @returns {string} e.g. "docquery:cache:org:abc-123"
 */
function buildKey(...parts) {
  return [KEY_PREFIX, ...parts].join(':');
}

/**
 * GET a value from Redis. Returns parsed JSON or null.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function get(key) {
  if (!isRedisReady()) return null;
  try {
    const data = await getRedisClient().get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * SET a value in Redis with an optional TTL (seconds).
 * @param {string} key
 * @param {any} value — will be JSON.stringify'd
 * @param {number} [ttlSeconds] — time-to-live in seconds
 * @returns {Promise<boolean>}
 */
async function set(key, value, ttlSeconds) {
  if (!isRedisReady()) return false;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await getRedisClient().set(key, serialized, 'EX', ttlSeconds);
    } else {
      await getRedisClient().set(key, serialized);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * DELETE one or more keys.
 * @param {...string} keys
 * @returns {Promise<number>} — number of keys removed
 */
async function del(...keys) {
  if (!isRedisReady() || keys.length === 0) return 0;
  try {
    return await getRedisClient().del(...keys);
  } catch {
    return 0;
  }
}

/**
 * DELETE all keys matching a glob pattern using SCAN.
 * Uses SCAN to avoid blocking the Redis event loop.
 * @param {string} pattern — e.g. "docquery:cache:org:*"
 * @returns {Promise<number>} — number of keys removed
 */
async function delPattern(pattern) {
  if (!isRedisReady()) return 0;
  try {
    const client = getRedisClient();
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  } catch {
    return 0;
  }
}

/**
 * Check if a key exists.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function exists(key) {
  if (!isRedisReady()) return false;
  try {
    const result = await getRedisClient().exists(key);
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Set a TTL on an existing key.
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>}
 */
async function expire(key, ttlSeconds) {
  if (!isRedisReady()) return false;
  try {
    const result = await getRedisClient().expire(key, ttlSeconds);
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Atomically increment a key's value and set TTL on first increment.
 * Used for rate-limiting counters.
 * @param {string} key
 * @param {number} ttlSeconds — TTL applied only when the key is new
 * @returns {Promise<{ count: number, ttl: number }|null>}
 */
async function increment(key, ttlSeconds) {
  if (!isRedisReady()) return null;
  try {
    const client = getRedisClient();
    const multi = client.multi();
    multi.incr(key);
    multi.ttl(key);
    const results = await multi.exec();

    const count = results[0][1]; // [err, value]
    const ttl = results[1][1];

    // If TTL is -1, the key has no expiry yet (first increment)
    if (ttl === -1 && ttlSeconds) {
      await client.expire(key, ttlSeconds);
    }

    return { count, ttl: ttl === -1 ? ttlSeconds : ttl };
  } catch {
    return null;
  }
}

module.exports = {
  buildKey,
  get,
  set,
  del,
  delPattern,
  exists,
  expire,
  increment,
};
