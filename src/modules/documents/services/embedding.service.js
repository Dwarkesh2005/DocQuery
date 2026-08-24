const { env } = require('../../../config/env');
const { logger } = require('../../../config/logger');
const { OpenAIEmbeddingProvider } = require('./providers/openai.provider');
const { MockEmbeddingProvider } = require('./providers/mock.provider');

// ============================================================
// Embedding Service
// ============================================================
// Orchestrates vector embedding generation for document chunks.
// Supports batching, dimension validation, and interchangeable providers.

class EmbeddingService {
  /**
   * @param {object} [options]
   * @param {import('./providers/base.provider').BaseEmbeddingProvider} [options.provider]
   * @param {number} [options.batchSize=50]
   */
  constructor(options = {}) {
    this.batchSize = options.batchSize || 50;
    this.expectedDimension = env.EMBEDDING_DIMENSION || 1536;

    if (options.provider) {
      this.provider = options.provider;
    } else if (env.EMBEDDING_PROVIDER === 'mock' || (!env.OPENAI_API_KEY && env.NODE_ENV === 'test')) {
      this.provider = new MockEmbeddingProvider(this.expectedDimension);
    } else {
      this.provider = new OpenAIEmbeddingProvider();
    }
  }

  /**
   * Override or set the active embedding provider.
   * @param {import('./providers/base.provider').BaseEmbeddingProvider} provider
   */
  setProvider(provider) {
    this.provider = provider;
  }

  /**
   * Return the active vector dimension.
   * @returns {number}
   */
  getDimension() {
    return this.provider ? this.provider.getDimension() : this.expectedDimension;
  }

  /**
   * Generate an embedding vector for a single text.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    const results = await this.generateEmbeddings([text]);
    return results[0];
  }

  /**
   * Generate embeddings for multiple texts in batches.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    const allEmbeddings = [];
    const totalBatches = Math.ceil(texts.length / this.batchSize);

    logger.debug(
      { totalTexts: texts.length, batchSize: this.batchSize, totalBatches },
      'Starting batched embedding generation'
    );

    const startTime = Date.now();
    try {
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        const batchIndex = Math.floor(i / this.batchSize) + 1;

        logger.trace({ batchIndex, totalBatches, count: batch.length }, 'Processing embedding batch');

        const batchVectors = await this.provider.generateEmbeddings(batch);

        if (!Array.isArray(batchVectors) || batchVectors.length !== batch.length) {
          throw new Error(
            `Embedding provider returned ${batchVectors?.length ?? 0} vectors for a batch of ${batch.length} items`
          );
        }

        // Validate dimensions
        for (let j = 0; j < batchVectors.length; j++) {
          const vec = batchVectors[j];
          if (!Array.isArray(vec) || vec.length !== this.expectedDimension) {
            throw new Error(
              `Embedding dimension mismatch: expected ${this.expectedDimension}, but got ${vec?.length}`
            );
          }
        }

        allEmbeddings.push(...batchVectors);
      }

      const durationMs = Date.now() - startTime;
      const { metricsService } = require('../../../services/metrics.service');
      metricsService.recordEmbeddingCall({
        textCount: texts.length,
        durationMs,
        success: true,
      });

      logger.debug({ totalEmbeddings: allEmbeddings.length, durationMs }, 'Embedding generation complete');
      return allEmbeddings;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const { metricsService } = require('../../../services/metrics.service');
      metricsService.recordEmbeddingCall({
        textCount: texts.length,
        durationMs,
        success: false,
      });
      throw error;
    }
  }
}

const embeddingService = new EmbeddingService();

module.exports = { EmbeddingService, embeddingService };
