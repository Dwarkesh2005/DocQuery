const { ScoreReranker } = require('./score.reranker');
const { CohereReranker } = require('./cohere.reranker');
const { env } = require('../../../config/env');

// ============================================================
// Reranker Factory
// ============================================================
// Instantiates the active reranker based on configuration.

class RerankerFactory {
  /**
   * Get the active reranker instance.
   * @param {string} [provider]
   * @returns {import('./base.reranker').BaseReranker}
   */
  static getReranker(provider = env.RERANKER_PROVIDER) {
    switch (provider) {
      case 'cohere':
        return new CohereReranker({ apiKey: env.COHERE_API_KEY });
      case 'score':
      case 'local':
      default:
        return new ScoreReranker();
    }
  }
}

module.exports = {
  RerankerFactory,
  reranker: RerankerFactory.getReranker(),
};
