// ============================================================
// Model Router Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Selects appropriate model tier (cheap vs advanced) based on query complexity.

class ModelRouterService {
  /**
   * Determine optimal LLM model tier given query intent and complexity.
   * @param {object} params
   * @param {string} params.query
   * @param {string} [params.intent] - 'factual' | 'summarization' | 'comparison' | 'procedural'
   * @param {number} [params.contextTokens]
   * @returns {{ tier: 'FAST' | 'ADVANCED', model: string }}
   */
  route({ query, intent = 'factual', contextTokens = 500 }) {
    const isComplex =
      intent === 'comparison' ||
      intent === 'summarization' ||
      contextTokens > 2000 ||
      query.length > 200;

    if (isComplex) {
      return {
        tier: 'ADVANCED',
        model: 'gpt-4o',
      };
    }

    return {
      tier: 'FAST',
      model: 'gpt-4o-mini',
    };
  }
}

const modelRouterService = new ModelRouterService();

module.exports = {
  ModelRouterService,
  modelRouterService,
};
