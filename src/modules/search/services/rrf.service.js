const { RAG_CONFIG } = require('../../../config/rag.config');
const { env } = require('../../../config/env');

// ============================================================
// Reciprocal Rank Fusion (RRF) Service
// ============================================================
// Combines rankings from disparate retrieval modalities (e.g. dense vector search
// and sparse lexical full-text search) into a single, calibrated relevance ranking.
//
// Formula:
//   RRF_score(d) = \sum_{m \in Modalities} \frac{1}{k + rank_m(d)}
//
// Parameters:
//   - k: Smoothing constant preventing top-ranked items from dominating disproportionately (default: 60).

class RRFService {
  /**
   * Fuse multiple ranked retrieval result lists using Reciprocal Rank Fusion.
   *
   * @param {Array<object>} vectorResults - Ranked results from semantic vector search
   * @param {Array<object>} keywordResults - Ranked results from lexical keyword search
   * @param {object} [options]
   * @param {number} [options.k] - RRF smoothing parameter (default: 60)
   * @param {number} [options.topK] - Max fused results to return
   * @returns {Array<object>} Fused and deduplicated ranked results
   */
  fuseResults(vectorResults = [], keywordResults = [], options = {}) {
    const k = options.k || env.RRF_K_CONSTANT || RAG_CONFIG.rrfK || 60;
    const topK = options.topK || RAG_CONFIG.fusedTopK || 20;

    const chunkMap = new Map();

    // 1. Process Vector Results (1-based ranks)
    if (Array.isArray(vectorResults)) {
      vectorResults.forEach((item, index) => {
        const chunkId = item.chunkId;
        if (!chunkId) return;

        const rank = index + 1;
        const scoreContribution = 1.0 / (k + rank);

        if (!chunkMap.has(chunkId)) {
          chunkMap.set(chunkId, {
            chunkId,
            documentId: item.documentId,
            content: item.content,
            pageNumber: item.pageNumber ?? null,
            chunkIndex: item.chunkIndex,
            metadata: item.metadata || {},
            vectorRank: rank,
            keywordRank: null,
            vectorScore: item.score ?? null,
            keywordScore: null,
            rrfScore: scoreContribution,
          });
        } else {
          const existing = chunkMap.get(chunkId);
          existing.vectorRank = rank;
          existing.vectorScore = item.score ?? null;
          existing.rrfScore += scoreContribution;
        }
      });
    }

    // 2. Process Keyword Results (1-based ranks)
    if (Array.isArray(keywordResults)) {
      keywordResults.forEach((item, index) => {
        const chunkId = item.chunkId;
        if (!chunkId) return;

        const rank = index + 1;
        const scoreContribution = 1.0 / (k + rank);

        if (!chunkMap.has(chunkId)) {
          chunkMap.set(chunkId, {
            chunkId,
            documentId: item.documentId,
            content: item.content,
            pageNumber: item.pageNumber ?? null,
            chunkIndex: item.chunkIndex,
            metadata: item.metadata || {},
            vectorRank: null,
            keywordRank: rank,
            vectorScore: null,
            keywordScore: item.score ?? null,
            rrfScore: scoreContribution,
          });
        } else {
          const existing = chunkMap.get(chunkId);
          existing.keywordRank = rank;
          existing.keywordScore = item.score ?? null;
          existing.rrfScore += scoreContribution;
        }
      });
    }

    // 3. Sort by aggregated RRF score descending
    const fusedList = Array.from(chunkMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);

    // 4. Format scores and slice topK
    const results = fusedList.slice(0, topK).map((item, index) => ({
      ...item,
      fusedRank: index + 1,
      rrfScore: Number(item.rrfScore.toFixed(6)),
      score: Number(item.rrfScore.toFixed(6)),
    }));

    return results;
  }
}

const rrfService = new RRFService();

module.exports = {
  RRFService,
  rrfService,
};
