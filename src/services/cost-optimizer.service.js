const crypto = require('crypto');
const { getRedisClient, isRedisReady } = require('../config/redis');
const { logger } = require('../config/logger');

// ============================================================
// Cost Optimization Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Implements embedding caching, context compression, and token budgeting.

class CostOptimizerService {
  constructor() {
    this.memoryEmbeddingCache = new Map();
  }

  /**
   * Compute text hash for cache key.
   */
  hashText(text) {
    return crypto.createHash('sha256').update(text.trim()).digest('hex');
  }

  /**
   * Get cached embedding for text snippet if available.
   * @param {string} text
   * @returns {Promise<number[]|null>}
   */
  async getCachedEmbedding(text) {
    const hash = this.hashText(text);

    // 1. Check memory cache
    if (this.memoryEmbeddingCache.has(hash)) {
      return this.memoryEmbeddingCache.get(hash);
    }

    // 2. Check Redis cache if ready
    if (isRedisReady()) {
      try {
        const redis = getRedisClient();
        const cached = await redis.get(`emb:${hash}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.memoryEmbeddingCache.set(hash, parsed);
          return parsed;
        }
      } catch (err) {
        logger.warn({ error: err.message }, 'Redis embedding cache lookup error');
      }
    }

    return null;
  }

  /**
   * Store embedding in cache.
   * @param {string} text
   * @param {number[]} vector
   * @param {number} [ttlSeconds=86400]
   */
  async cacheEmbedding(text, vector, ttlSeconds = 86400) {
    const hash = this.hashText(text);
    this.memoryEmbeddingCache.set(hash, vector);

    // Bound memory cache size
    if (this.memoryEmbeddingCache.size > 5000) {
      const firstKey = this.memoryEmbeddingCache.keys().next().value;
      this.memoryEmbeddingCache.delete(firstKey);
    }

    if (isRedisReady()) {
      try {
        const redis = getRedisClient();
        await redis.set(`emb:${hash}`, JSON.stringify(vector), 'EX', ttlSeconds);
      } catch (err) {
        logger.warn({ error: err.message }, 'Redis embedding cache set error');
      }
    }
  }

  /**
   * Compress and deduplicate context chunks to optimize LLM token usage.
   * Trims whitespace and removes duplicate sentences.
   * @param {Array<{ content: string }>} chunks
   * @param {number} [maxTokens=3000]
   * @returns {Array<{ content: string }>}
   */
  compressContext(chunks, maxTokens = 3000) {
    if (!Array.isArray(chunks)) return [];

    const seenSentences = new Set();
    const compressedChunks = [];
    let estimatedTokens = 0;

    for (const chunk of chunks) {
      const sentences = chunk.content
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const uniqueSentences = [];
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        if (!seenSentences.has(lower)) {
          seenSentences.add(lower);
          uniqueSentences.push(sentence);
        }
      }

      const compressedContent = uniqueSentences.join(' ');
      const chunkTokens = Math.ceil(compressedContent.length / 4);

      if (estimatedTokens + chunkTokens <= maxTokens) {
        compressedChunks.push({
          ...chunk,
          content: compressedContent,
        });
        estimatedTokens += chunkTokens;
      }
    }

    return compressedChunks;
  }
}

const costOptimizerService = new CostOptimizerService();

module.exports = {
  CostOptimizerService,
  costOptimizerService,
};
