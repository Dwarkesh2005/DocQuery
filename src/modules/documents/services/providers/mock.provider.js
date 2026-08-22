const crypto = require('crypto');
const { BaseEmbeddingProvider } = require('./base.provider');

// ============================================================
// Mock / Test Deterministic Embedding Provider
// ============================================================
// Produces deterministic 1536-dimensional L2-normalized float vectors
// based on SHA-256 text hashing. Used for automated tests and offline CI.

class MockEmbeddingProvider extends BaseEmbeddingProvider {
  constructor(dimension = 1536) {
    super();
    this.dimension = dimension;
  }

  getDimension() {
    return this.dimension;
  }

  /**
   * Produce a deterministic float vector of specified dimension from input text.
   * @param {string} text
   * @returns {number[]}
   */
  _generateSingle(text) {
    const vector = new Float32Array(this.dimension);
    const hash = crypto.createHash('sha256').update(text || '').digest();

    for (let i = 0; i < this.dimension; i++) {
      const byte1 = hash[i % hash.length];
      const byte2 = hash[(i + 7) % hash.length];
      const val = ((byte1 << 8) | byte2) / 65535; // Value between 0 and 1
      vector[i] = (val * 2) - 1; // Value between -1 and 1
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] = vector[i] / norm;
      }
    }

    return Array.from(vector);
  }

  async generateEmbeddings(texts) {
    if (!Array.isArray(texts)) return [];
    return texts.map((t) => this._generateSingle(t));
  }
}

module.exports = { MockEmbeddingProvider };
