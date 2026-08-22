const { BaseEmbeddingProvider } = require('./base.provider');
const { resilientFetch } = require('../../../../utils/http-client');
const { logger } = require('../../../../config/logger');

// ============================================================
// OpenAI Embedding Provider
// ============================================================
// Integrates with OpenAI's /v1/embeddings API using resilient HTTP requests.

class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   * @param {number} [options.dimension]
   */
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimension = options.dimension || parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10);
  }

  getDimension() {
    return this.dimension;
  }

  /**
   * Generate vector embeddings for a list of input texts.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    if (!this.apiKey) {
      throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY in environment or configure a valid embedding provider.');
    }

    const payload = {
      model: this.model,
      input: texts,
      dimensions: this.dimension,
    };

    logger.debug({ model: this.model, textCount: texts.length }, 'Calling OpenAI Embeddings API');

    const response = await resilientFetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
      timeout: 30000,
      retries: 3,
      service: 'OpenAI-Embeddings',
    });

    if (!response || !Array.isArray(response.data)) {
      throw new Error('Invalid response structure received from OpenAI embeddings API');
    }

    // Sort by index to ensure original order is preserved
    const sortedData = [...response.data].sort((a, b) => a.index - b.index);
    return sortedData.map((item) => item.embedding);
  }
}

module.exports = { OpenAIEmbeddingProvider };
