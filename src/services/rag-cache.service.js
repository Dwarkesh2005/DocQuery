const crypto = require('crypto');
const redisService = require('./redis.service');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

// ============================================================
// RAG Cache Service — Tenant-Isolated Response Caching
// ============================================================
// Caches repeated/expensive RAG query results with strict multi-tenant
// key namespacing, cryptographic normalization hashing, and fail-open degradation.
//
// Key format:
//   docquery:rag:tenant:<organizationId>:query:<sha256Hash>

class RagCacheService {
  /**
   * Compute a deterministic cryptographic hash for query context.
   *
   * @param {object} params
   * @param {string} params.query
   * @param {string} [params.documentId]
   * @param {number} [params.topK]
   * @param {number} [params.threshold]
   * @returns {string} SHA-256 hex string
   */
  computeQueryHash({ query, documentId, topK, threshold }) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    const docScope = documentId || 'all';
    const k = topK || env.SEARCH_DEFAULT_TOP_K;
    const thresh = threshold !== undefined && threshold !== null ? threshold : env.SEARCH_SIMILARITY_THRESHOLD;

    const rawSignature = `${normalizedQuery}:::${docScope}:::${k}:::${thresh}`;
    return crypto.createHash('sha256').update(rawSignature).digest('hex');
  }

  /**
   * Build the tenant-isolated Redis key.
   *
   * @param {string} organizationId
   * @param {string} queryHash
   * @returns {string}
   */
  buildCacheKey(organizationId, queryHash) {
    return redisService.buildKey('rag', 'tenant', organizationId, 'query', queryHash);
  }

  /**
   * Fetch cached RAG answer and citations.
   *
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.query
   * @param {string} [params.documentId]
   * @param {number} [params.topK]
   * @param {number} [params.threshold]
   * @returns {Promise<{ answer: string, citations: Array, metadata: object }|null>}
   */
  async get({ organizationId, query, documentId, topK, threshold }) {
    if (!organizationId || !query) return null;

    try {
      const hash = this.computeQueryHash({ query, documentId, topK, threshold });
      const key = this.buildCacheKey(organizationId, hash);
      const cached = await redisService.get(key);

      if (cached) {
        logger.debug({ organizationId, queryHash: hash }, 'RAG cache HIT');
        return cached;
      }

      return null;
    } catch (error) {
      logger.warn({ organizationId, error: error.message }, 'RAG cache get failed, bypassing');
      return null;
    }
  }

  /**
   * Store RAG query response in tenant cache.
   *
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.query
   * @param {string} [params.documentId]
   * @param {number} [params.topK]
   * @param {number} [params.threshold]
   * @param {object} params.data
   * @param {number} [params.ttlSeconds]
   * @returns {Promise<boolean>}
   */
  async set({ organizationId, query, documentId, topK, threshold, data, ttlSeconds }) {
    if (!organizationId || !query || !data) return false;

    try {
      const hash = this.computeQueryHash({ query, documentId, topK, threshold });
      const key = this.buildCacheKey(organizationId, hash);
      const ttl = ttlSeconds || env.RAG_CACHE_TTL_SECONDS || 3600;

      const success = await redisService.set(key, data, ttl);
      if (success) {
        logger.debug({ organizationId, queryHash: hash, ttl }, 'RAG cache SET');
      }
      return success;
    } catch (error) {
      logger.warn({ organizationId, error: error.message }, 'RAG cache set failed');
      return false;
    }
  }

  /**
   * Invalidate all cached RAG responses for a given organization (tenant).
   * Called on document uploads, deletions, or status transitions to READY.
   *
   * @param {string} organizationId
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateTenant(organizationId) {
    if (!organizationId) return 0;

    try {
      const pattern = redisService.buildKey('rag', 'tenant', organizationId, '*');
      const deletedCount = await redisService.delPattern(pattern);
      logger.info({ organizationId, deletedCount }, 'Invalidated RAG cache for tenant');
      return deletedCount;
    } catch (error) {
      logger.warn({ organizationId, error: error.message }, 'RAG cache invalidation failed');
      return 0;
    }
  }
}

const ragCacheService = new RagCacheService();

module.exports = {
  RagCacheService,
  ragCacheService,
};
