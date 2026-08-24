const { searchRepository } = require('../search.repository');
const { documentRepository } = require('../../documents/repositories/document.repository');
const { NotFoundError } = require('../../../utils/errors');
const { logger } = require('../../../config/logger');
const { RAG_CONFIG } = require('../../../config/rag.config');

// ============================================================
// Keyword Search Service — PostgreSQL Full-Text Lexical Search
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

class KeywordSearchService {
  /**
   * @param {object} [options]
   * @param {import('../search.repository').SearchRepository} [options.repository]
   */
  constructor(options = {}) {
    this.repository = options.repository || searchRepository;
  }

  /**
   * Execute tenant-isolated keyword / full-text search.
   *
   * @param {object} params
   * @param {string} params.organizationId - Validated tenant UUID
   * @param {string} params.query - Keyword search query
   * @param {number} [params.topK] - Max results to return
   * @param {string} [params.documentId] - Optional document UUID filter
   * @param {string[]} [params.allowedDocumentIds] - Optional array of permitted document UUIDs
   * @returns {Promise<{ query: string, results: Array<object> }>}
   */
  async search({
    organizationId,
    query,
    topK = RAG_CONFIG.keywordTopK,
    documentId = null,
    allowedDocumentIds = null,
  }) {
    const startTime = Date.now();

    if (!query || !query.trim()) {
      return { query, results: [] };
    }

    if (Array.isArray(allowedDocumentIds) && allowedDocumentIds.length === 0) {
      return { query, results: [] };
    }

    // 1. Verify document ownership if documentId is specified
    if (documentId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.organizationId !== organizationId) {
        throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
      }
      if (document.status !== 'READY') {
        return { query, results: [] };
      }
    }

    // 2. Query PostgreSQL full-text search engine
    const rawChunks = await this.repository.findKeywordChunks({
      organizationId,
      query: query.trim(),
      topK,
      documentId,
      allowedDocumentIds,
    });

    const results = rawChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      content: chunk.content,
      score: Number(parseFloat(chunk.score || 0).toFixed(4)),
      pageNumber: chunk.pageNumber ?? null,
      chunkIndex: chunk.chunkIndex,
      metadata: chunk.metadata || {},
    }));

    const durationMs = Date.now() - startTime;
    logger.debug(
      { organizationId, query, resultCount: results.length, durationMs },
      'Keyword search completed'
    );

    return {
      query,
      results,
    };
  }
}

const keywordSearchService = new KeywordSearchService();

module.exports = {
  KeywordSearchService,
  keywordSearchService,
};
