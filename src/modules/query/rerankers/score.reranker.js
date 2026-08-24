const { BaseReranker } = require('./base.reranker');

// ============================================================
// Score Reranker — Heuristic Relevance Scorer
// ============================================================
// Built-in, high-performance reranker that requires no external API keys
// or network roundtrips. Combines retrieval scores, exact term matches,
// keyword coverage ratio, and query term density.

class ScoreReranker extends BaseReranker {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    super();
    this.name = 'ScoreReranker';
  }

  /**
   * Rerank documents using hybrid lexical-density and position heuristics.
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

    const topK = options.topK || documents.length;
    const cleanQuery = (query || '').toLowerCase().trim();
    const queryTokens = cleanQuery
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

    const scoredDocs = documents.map((doc, originalIndex) => {
      const content = (doc.content || '').toLowerCase();
      let lexicalBonus = 0;

      if (queryTokens.length > 0) {
        // 1. Term Coverage Ratio (how many distinct query tokens appear)
        const matchedTokens = queryTokens.filter((token) => content.includes(token));
        const coverageRatio = matchedTokens.length / queryTokens.length;

        // 2. Exact phrase match bonus
        const exactMatchBonus = content.includes(cleanQuery) ? 0.3 : 0.0;

        // 3. Frequency density
        let totalOccurrences = 0;
        for (const token of matchedTokens) {
          const count = (content.match(new RegExp(`\\b${token}\\b`, 'g')) || []).length;
          totalOccurrences += count;
        }
        const densityBonus = Math.min(totalOccurrences * 0.05, 0.2);

        lexicalBonus = (coverageRatio * 0.5) + exactMatchBonus + densityBonus;
      }

      // Base score from previous stage (RRF score or vector score)
      const baseScore = doc.score || (1.0 / (60 + originalIndex + 1));
      const combinedScore = baseScore + lexicalBonus;

      return {
        ...doc,
        rerankScore: Number(combinedScore.toFixed(6)),
      };
    });

    // Sort by rerank score descending
    scoredDocs.sort((a, b) => b.rerankScore - a.rerankScore);

    return scoredDocs.slice(0, topK).map((doc, index) => ({
      chunkId: doc.chunkId,
      documentId: doc.documentId,
      content: doc.content,
      score: doc.rerankScore,
      vectorScore: doc.vectorScore ?? doc.score,
      rank: index + 1,
      pageNumber: doc.pageNumber ?? null,
      chunkIndex: doc.chunkIndex,
      metadata: doc.metadata || {},
    }));
  }
}

module.exports = { ScoreReranker };
