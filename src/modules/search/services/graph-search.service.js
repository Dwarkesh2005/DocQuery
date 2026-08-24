const { knowledgeGraphService } = require('../../knowledge-graph/knowledge-graph.service');
const { searchRepository } = require('../search.repository');
const { logger } = require('../../../config/logger');

// ============================================================
// Graph Search Service — Knowledge Graph Retrieval
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Extracts query entities, queries the knowledge graph for related concepts,
// and retrieves linked document chunks with permission enforcement.

class GraphSearchService {
  /**
   * @param {object} [options]
   * @param {import('../../knowledge-graph/knowledge-graph.service').KnowledgeGraphService} [options.graphService]
   * @param {import('../search.repository').SearchRepository} [options.searchRepo]
   */
  constructor(options = {}) {
    this.graph = options.graphService || knowledgeGraphService;
    this.searchRepo = options.searchRepo || searchRepository;
  }

  /**
   * Search knowledge graph and return linked chunks or entities.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.query
   * @param {number} [params.topK=5]
   * @param {string[]} [params.allowedDocumentIds]
   * @returns {Promise<Array<object>>}
   */
  async search({
    organizationId,
    query,
    topK = 5,
    allowedDocumentIds = null,
  }) {
    if (!query || !query.trim()) return [];

    try {
      // 1. Extract query words / entities
      const candidateEntities = query
        .replace(/[^a-zA-Z0-9\s_-]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);

      if (candidateEntities.length === 0) return [];

      // 2. Query knowledge graph for matching and linked entities
      const graphMatches = await this.graph.findRelatedEntities(organizationId, candidateEntities);
      if (!graphMatches || graphMatches.length === 0) return [];

      // 3. Collect linked document IDs or keywords
      const linkedDocIds = new Set();
      const linkedKeywords = new Set();

      for (const entity of graphMatches) {
        if (entity.metadata?.documentId) {
          linkedDocIds.add(entity.metadata.documentId);
        }
        for (const rel of entity.sourceOf || []) {
          if (rel.targetEntity?.name) linkedKeywords.add(rel.targetEntity.name);
          if (rel.metadata?.documentId) linkedDocIds.add(rel.metadata.documentId);
        }
        for (const rel of entity.targetOf || []) {
          if (rel.sourceEntity?.name) linkedKeywords.add(rel.sourceEntity.name);
          if (rel.metadata?.documentId) linkedDocIds.add(rel.metadata.documentId);
        }
      }

      // If linked keywords found, perform a targeted keyword search
      if (linkedKeywords.size > 0) {
        const keywordQuery = Array.from(linkedKeywords).slice(0, 5).join(' ');
        const chunks = await this.searchRepo.findKeywordChunks({
          organizationId,
          query: keywordQuery,
          topK,
          allowedDocumentIds,
        });

        return chunks.map((c) => ({
          ...c,
          score: Number(parseFloat(c.score || 0.5).toFixed(4)),
          retrievalMethod: 'GRAPH',
        }));
      }

      return [];
    } catch (error) {
      logger.warn({ error: error.message, organizationId }, 'Graph search non-fatal failure');
      return [];
    }
  }
}

const graphSearchService = new GraphSearchService();

module.exports = {
  GraphSearchService,
  graphSearchService,
};
