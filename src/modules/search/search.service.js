const { searchRepository } = require('./search.repository');
const { embeddingService } = require('../documents/services/embedding.service');
const { documentRepository } = require('../documents/repositories/document.repository');
const { NotFoundError } = require('../../utils/errors');
const { logger } = require('../../config/logger');
const { env } = require('../../config/env');

// ============================================================
// Search Service
// ============================================================
// Orchestrates query vector generation and tenant-isolated pgvector search.

class SearchService {
  /**
   * @param {object} [options]
   * @param {import('./search.repository').SearchRepository} [options.repository]
   * @param {import('../documents/services/embedding.service').EmbeddingService} [options.embeddingService]
   */
  constructor(options = {}) {
    this.repository = options.repository || searchRepository;
    this.embeddingService = options.embeddingService || embeddingService;
  }

  /**
   * Search organization document chunks by semantic similarity.
   *
   * @param {object} params
   * @param {string} params.organizationId - Authenticated tenant ID
   * @param {string} params.query - Natural language search query
   * @param {number} [params.topK] - Max results to return
   * @param {string} [params.documentId] - Optional document filter
   * @param {number} [params.threshold] - Optional similarity threshold override
   * @returns {Promise<{ query: string, results: Array<{ chunkId: string, documentId: string, content: string, score: number, pageNumber: number | null, chunkIndex: number, metadata: object }> }>}
   */
  async search({
    organizationId,
    query,
    topK = env.SEARCH_DEFAULT_TOP_K,
    documentId = null,
    threshold = env.SEARCH_SIMILARITY_THRESHOLD,
  }) {
    const startTime = Date.now();

    // 1. Verify document ownership if documentId is provided
    if (documentId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.organizationId !== organizationId) {
        throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
      }
      if (document.status !== 'READY') {
        // Document is not indexed/ready for search yet
        return {
          query,
          results: [],
        };
      }
    }

    // 2. Generate embedding vector for the user query using the Phase 3 model
    const queryVector = await this.embeddingService.generateEmbedding(query);

    // 3. Execute tenant-scoped vector similarity query in PostgreSQL
    const rawChunks = await this.repository.findSimilarChunks({
      organizationId,
      queryVector,
      topK,
      threshold,
      documentId,
    });

    // 4. Format and structure results
    const results = rawChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      content: chunk.content,
      score: Number(parseFloat(chunk.score).toFixed(4)),
      pageNumber: chunk.pageNumber ?? null,
      chunkIndex: chunk.chunkIndex,
      metadata: chunk.metadata || {},
    }));

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        organizationId,
        topK,
        documentId: documentId || undefined,
        threshold,
        resultCount: results.length,
        durationMs,
      },
      'Semantic search completed'
    );

    return {
      query,
      results,
    };
  }
}

const searchService = new SearchService();

module.exports = {
  SearchService,
  searchService,
};
