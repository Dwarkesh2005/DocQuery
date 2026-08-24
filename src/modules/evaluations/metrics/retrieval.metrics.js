// ============================================================
// Retrieval Metrics — Standard Information Retrieval Benchmarks
// ============================================================
// Independent, deterministic metric calculations for RAG evaluation.

class RetrievalMetrics {
  /**
   * Calculate Precision@K.
   * Fraction of top-K retrieved items that are relevant.
   *
   * @param {Array<string>} retrievedIds - Ordered array of retrieved chunk or document IDs
   * @param {Array<string>} expectedIds  - Ground-truth relevant chunk or document IDs
   * @param {number} [k]                - Cutoff rank K (defaults to retrievedIds.length)
   * @returns {number} Value in [0.0, 1.0]
   */
  static precisionAtK(retrievedIds = [], expectedIds = [], k = null) {
    if (!Array.isArray(retrievedIds) || retrievedIds.length === 0) return 0.0;
    if (!Array.isArray(expectedIds) || expectedIds.length === 0) return 0.0;

    const cutoff = k != null && k > 0 ? Math.min(k, retrievedIds.length) : retrievedIds.length;
    const topK = retrievedIds.slice(0, cutoff);
    const expectedSet = new Set(expectedIds.map(String));

    let relevantCount = 0;
    for (const id of topK) {
      if (expectedSet.has(String(id))) {
        relevantCount += 1;
      }
    }

    return Number((relevantCount / cutoff).toFixed(4));
  }

  /**
   * Calculate Recall@K.
   * Fraction of ground-truth relevant items that were retrieved in top-K.
   *
   * @param {Array<string>} retrievedIds - Ordered array of retrieved chunk or document IDs
   * @param {Array<string>} expectedIds  - Ground-truth relevant chunk or document IDs
   * @param {number} [k]                - Cutoff rank K (defaults to retrievedIds.length)
   * @returns {number} Value in [0.0, 1.0]
   */
  static recallAtK(retrievedIds = [], expectedIds = [], k = null) {
    if (!Array.isArray(expectedIds) || expectedIds.length === 0) return 1.0;
    if (!Array.isArray(retrievedIds) || retrievedIds.length === 0) return 0.0;

    const cutoff = k != null && k > 0 ? Math.min(k, retrievedIds.length) : retrievedIds.length;
    const topK = retrievedIds.slice(0, cutoff);
    const expectedSet = new Set(expectedIds.map(String));

    let relevantCount = 0;
    for (const id of topK) {
      if (expectedSet.has(String(id))) {
        relevantCount += 1;
      }
    }

    return Number((relevantCount / expectedIds.length).toFixed(4));
  }

  /**
   * Calculate Reciprocal Rank (RR) for a single query.
   * 1 / rank of the first relevant retrieved document.
   *
   * @param {Array<string>} retrievedIds - Ordered array of retrieved chunk or document IDs
   * @param {Array<string>} expectedIds  - Ground-truth relevant chunk or document IDs
   * @returns {number} Value in [0.0, 1.0]
   */
  static reciprocalRank(retrievedIds = [], expectedIds = []) {
    if (!Array.isArray(retrievedIds) || retrievedIds.length === 0) return 0.0;
    if (!Array.isArray(expectedIds) || expectedIds.length === 0) return 0.0;

    const expectedSet = new Set(expectedIds.map(String));

    for (let i = 0; i < retrievedIds.length; i++) {
      if (expectedSet.has(String(retrievedIds[i]))) {
        return Number((1.0 / (i + 1)).toFixed(4));
      }
    }

    return 0.0;
  }

  /**
   * Calculate Mean Reciprocal Rank (MRR) across multiple queries.
   *
   * @param {Array<{ retrievedIds: Array<string>, expectedIds: Array<string> }>} queryResults
   * @returns {number} Value in [0.0, 1.0]
   */
  static meanReciprocalRank(queryResults = []) {
    if (!Array.isArray(queryResults) || queryResults.length === 0) return 0.0;

    const sumRR = queryResults.reduce(
      (acc, { retrievedIds, expectedIds }) =>
        acc + RetrievalMetrics.reciprocalRank(retrievedIds, expectedIds),
      0
    );

    return Number((sumRR / queryResults.length).toFixed(4));
  }

  /**
   * Calculate Hit Rate (Binary indication if at least one relevant item is retrieved).
   *
   * @param {Array<string>} retrievedIds
   * @param {Array<string>} expectedIds
   * @param {number} [k]
   * @returns {number} 1.0 if hit, 0.0 otherwise
   */
  static hitRate(retrievedIds = [], expectedIds = [], k = null) {
    if (!Array.isArray(retrievedIds) || retrievedIds.length === 0) return 0.0;
    if (!Array.isArray(expectedIds) || expectedIds.length === 0) return 0.0;

    const cutoff = k != null && k > 0 ? Math.min(k, retrievedIds.length) : retrievedIds.length;
    const topK = retrievedIds.slice(0, cutoff);
    const expectedSet = new Set(expectedIds.map(String));

    const hasHit = topK.some((id) => expectedSet.has(String(id)));
    return hasHit ? 1.0 : 0.0;
  }
}

module.exports = { RetrievalMetrics };
