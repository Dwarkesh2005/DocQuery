const { searchService } = require('../search.service');
const { keywordSearchService } = require('./keyword-search.service');
const { rrfService } = require('./rrf.service');
const { logger } = require('../../../config/logger');
const { env } = require('../../../config/env');
const { RAG_CONFIG } = require('../../../config/rag.config');

// ============================================================
// Hybrid Search Service — Parallel Semantic + Lexical Fusion
// ============================================================
// Executes dense vector search and sparse keyword search concurrently,
// combining ranked outputs via Reciprocal Rank Fusion (RRF).
//
// Graceful Degradation: If vector search fails or keyword search fails,
// the service automatically falls back to the surviving modality.

class HybridSearchService {
  /**
   * @param {object} [options]
   * @param {import('../search.service').SearchService} [options.vectorSearchService]
   * @param {import('./keyword-search.service').KeywordSearchService} [options.keywordSearchService]
   * @param {import('./rrf.service').RRFService} [options.rrfService]
   */
  constructor(options = {}) {
    this.vectorSearch = options.vectorSearchService || searchService;
    this.keywordSearch = options.keywordSearchService || keywordSearchService;
    this.rrf = options.rrfService || rrfService;
  }

  /**
   * Execute hybrid retrieval for a user query.
   *
   * @param {object} params
   * @param {string} params.organizationId - Validated tenant UUID
   * @param {string} params.query - Search query
   * @param {number} [params.topK] - Fused top-K count
   * @param {string} [params.documentId] - Optional document filter
   * @param {number} [params.threshold] - Vector similarity threshold
   * @param {boolean} [params.enableHybrid] - Enable or disable keyword fusion
   * @returns {Promise<{ query: string, results: Array<object>, metadata: object }>}
   */
  async search({
    organizationId,
    query,
    topK = RAG_CONFIG.fusedTopK,
    documentId = null,
    threshold = env.SEARCH_SIMILARITY_THRESHOLD,
    enableHybrid = env.ENABLE_HYBRID_SEARCH !== false,
  }) {
    const startTime = Date.now();

    // If hybrid is disabled, fall back immediately to pure vector search
    if (!enableHybrid) {
      const vectorRes = await this.vectorSearch.search({
        organizationId,
        query,
        topK,
        documentId,
        threshold,
      });

      return {
        query,
        results: vectorRes.results || [],
        metadata: {
          strategy: 'VECTOR_ONLY',
          vectorResultsCount: vectorRes.results?.length || 0,
          keywordResultsCount: 0,
          fusedResultsCount: vectorRes.results?.length || 0,
          durationMs: Date.now() - startTime,
        },
      };
    }

    // Parallel Execution of Vector Search + Keyword Search with fault tolerance
    const [vectorOutcome, keywordOutcome] = await Promise.allSettled([
      this.vectorSearch.search({
        organizationId,
        query,
        topK: RAG_CONFIG.vectorTopK,
        documentId,
        threshold,
      }),
      this.keywordSearch.search({
        organizationId,
        query,
        topK: RAG_CONFIG.keywordTopK,
        documentId,
      }),
    ]);

    const vectorResults = vectorOutcome.status === 'fulfilled' ? vectorOutcome.value.results || [] : [];
    const keywordResults = keywordOutcome.status === 'fulfilled' ? keywordOutcome.value.results || [] : [];

    if (vectorOutcome.status === 'rejected') {
      logger.warn({ error: vectorOutcome.reason?.message }, 'Vector search failed in hybrid pipeline');
    }
    if (keywordOutcome.status === 'rejected') {
      logger.warn({ error: keywordOutcome.reason?.message }, 'Keyword search failed in hybrid pipeline');
    }

    // Apply Reciprocal Rank Fusion
    const fusedResults = this.rrf.fuseResults(vectorResults, keywordResults, {
      topK,
      k: env.RRF_K_CONSTANT || RAG_CONFIG.rrfK,
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        organizationId,
        query,
        vectorCount: vectorResults.length,
        keywordCount: keywordResults.length,
        fusedCount: fusedResults.length,
        durationMs,
      },
      'Hybrid search completed'
    );

    return {
      query,
      results: fusedResults,
      metadata: {
        strategy: 'HYBRID_RRF',
        vectorResultsCount: vectorResults.length,
        keywordResultsCount: keywordResults.length,
        fusedResultsCount: fusedResults.length,
        durationMs,
      },
    };
  }
}

const hybridSearchService = new HybridSearchService();

module.exports = {
  HybridSearchService,
  hybridSearchService,
};
