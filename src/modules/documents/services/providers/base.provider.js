// ============================================================
// Base Embedding Provider
// ============================================================
// Contract for all embedding providers.

class BaseEmbeddingProvider {
  /**
   * @param {string[]} texts - Array of text strings to embed
   * @returns {Promise<number[][]>} - Array of float embedding vectors
   */
  async generateEmbeddings(_texts) {
    throw new Error('Method "generateEmbeddings" must be implemented by concrete subclass');
  }

  /**
   * Returns the vector dimension produced by this provider.
   * @returns {number}
   */
  getDimension() {
    throw new Error('Method "getDimension" must be implemented by concrete subclass');
  }
}

module.exports = { BaseEmbeddingProvider };
