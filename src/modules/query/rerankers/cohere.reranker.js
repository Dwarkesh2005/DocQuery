const { BaseReranker } = require('./base.reranker');
const { ScoreReranker } = require('./score.reranker');
const { logger } = require('../../../config/logger');

// ============================================================
// Cohere Reranker — External Cross-Encoder Provider
// ============================================================
// Integrates with Cohere Rerank API (v3/v3.5) with automatic timeout,
// API key checks, and fallback to ScoreReranker on error.

class CohereReranker extends BaseReranker {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.model='rerank-v3.5']
   * @param {number} [options.timeoutMs=5000]
   */
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.COHERE_API_KEY || null;
    this.model = options.model || 'rerank-v3.5';
    this.timeoutMs = options.timeoutMs || 5000;
    this.fallbackReranker = new ScoreReranker();
    this.name = 'CohereReranker';
  }

  /**
   * Rerank documents using Cohere API with fallback to ScoreReranker.
   *
   * @param {string} query
   * @param {Array<object>} documents
   * @param {object} [options]
   * @param {number} [options.topK]
   * @returns {Promise<Array<object>>}
   */
  async rerank(query, documents = [], options = {}) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    // If no API key configured, gracefully fall back to ScoreReranker
    if (!this.apiKey) {
      logger.debug('Cohere API key not configured, using ScoreReranker fallback');
      return this.fallbackReranker.rerank(query, documents, options);
    }

    try {
      const topK = options.topK || documents.length;
      const docTexts = documents.map((d) => d.content || '');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: docTexts,
          top_n: topK,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Cohere Rerank API returned status ${response.status}`);
      }

      const data = await response.json();
      const results = data.results || [];

      // Map back to document objects with updated scores and ranks
      return results.map((item, index) => {
        const originalDoc = documents[item.index];
        return {
          ...originalDoc,
          score: Number(item.relevance_score.toFixed(6)),
          rank: index + 1,
        };
      });
    } catch (error) {
      logger.warn(
        { error: error.message },
        'Cohere rerank failed, falling back to local ScoreReranker'
      );
      return this.fallbackReranker.rerank(query, documents, options);
    }
  }
}

module.exports = { CohereReranker };
