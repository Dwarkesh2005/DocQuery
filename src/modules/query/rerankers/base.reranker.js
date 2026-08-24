// ============================================================
// Base Reranker — Provider Abstraction Interface
// ============================================================
// Defines the contract for reranking candidates retrieved via
// semantic and lexical retrieval.

class BaseReranker {
  /**
   * Rerank a list of retrieved documents for a given query.
   *
   * @param {string} query - Natural language query
   * @param {Array<object>} documents - Retrieved document chunks to score and reorder
   * @param {object} [options]
   * @param {number} [options.topK] - Max results to return after reranking
   * @returns {Promise<Array<{ chunkId: string, documentId: string, content: string, score: number, rank: number, metadata: object }>>}
   */
  async rerank(query, documents = [], options = {}) {
    throw new Error('rerank() must be implemented by subclass');
  }
}

module.exports = { BaseReranker };
