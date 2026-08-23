// ============================================================
// Base LLM Provider
// ============================================================
// Contract for all LLM (chat completion) providers.
// Mirrors the BaseEmbeddingProvider pattern used in Phase 3.

class BaseLLMProvider {
  /**
   * Generate an answer from a system prompt and user prompt.
   * @param {object} params
   * @param {string} params.systemPrompt - System-level instructions for the model
   * @param {string} params.userPrompt   - User question with context
   * @returns {Promise<string>} - The generated answer text
   */
  async generateAnswer(_params) {
    throw new Error('Method "generateAnswer" must be implemented by concrete subclass');
  }
}

module.exports = { BaseLLMProvider };
