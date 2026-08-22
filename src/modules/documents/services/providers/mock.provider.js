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
   * Compute a deterministic word vector using SHA-256 hash.
   * @param {string} term
   * @returns {Float32Array}
   */
  _hashToVector(term) {
    const vector = new Float32Array(this.dimension);
    const hash = crypto.createHash('sha256').update(term).digest();

    for (let i = 0; i < this.dimension; i++) {
      const byte1 = hash[i % hash.length];
      const byte2 = hash[(i + 7) % hash.length];
      const val = ((byte1 << 8) | byte2) / 65535; // Value between 0 and 1
      vector[i] = (val * 2) - 1; // Value between -1 and 1
    }
    return vector;
  }

  /**
   * Produce a deterministic float vector of specified dimension from input text.
   * Uses token composition (bag-of-words) to enable realistic similarity scoring in tests.
   * @param {string} text
   * @returns {number[]}
   */
  _generateSingle(text) {
    const vector = new Float32Array(this.dimension);
    const words = (text || '').toLowerCase().match(/\b\w+\b/g) || [];

    if (words.length === 0) {
      const fallback = this._hashToVector(text || '');
      for (let i = 0; i < this.dimension; i++) {
        vector[i] = fallback[i];
      }
    } else {
      for (const word of words) {
        const wordVec = this._hashToVector(word);
        for (let i = 0; i < this.dimension; i++) {
          vector[i] += wordVec[i];
        }
      }
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
