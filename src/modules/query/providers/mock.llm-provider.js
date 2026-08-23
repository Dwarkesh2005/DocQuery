const { BaseLLMProvider } = require('./base.llm-provider');

// ============================================================
// Mock / Test LLM Provider
// ============================================================
// Returns a deterministic answer for automated tests and offline CI.
// Never makes external API calls.

class MockLLMProvider extends BaseLLMProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.fixedAnswer] - Optional fixed answer to return
   */
  constructor(options = {}) {
    super();
    this.fixedAnswer = options.fixedAnswer || null;
    this.lastCall = null;
  }

  /**
   * Generate a deterministic mock answer.
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {string} params.userPrompt
   * @returns {Promise<string>}
   */
  async generateAnswer({ systemPrompt, userPrompt }) {
    // Store the last call for test assertions
    this.lastCall = { systemPrompt, userPrompt };

    if (this.fixedAnswer) {
      return this.fixedAnswer;
    }

    return 'Based on the provided documents, this is the generated answer from the mock LLM provider.';
  }
}

module.exports = { MockLLMProvider };
