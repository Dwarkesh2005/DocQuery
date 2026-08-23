const { BaseLLMProvider } = require('./base.llm-provider');
const { resilientFetch } = require('../../../utils/http-client');
const { logger } = require('../../../config/logger');

// ============================================================
// OpenAI LLM Provider
// ============================================================
// Integrates with OpenAI's Chat Completions API via resilientFetch.
// Uses the same OPENAI_API_KEY already configured in Phase 3.

class OpenAILLMProvider extends BaseLLMProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   */
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || process.env.LLM_MODEL || 'gpt-4o-mini';
  }

  /**
   * Generate an answer using OpenAI Chat Completions.
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {string} params.userPrompt
   * @returns {Promise<string>}
   */
  async generateAnswer({ systemPrompt, userPrompt }) {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is missing. Set OPENAI_API_KEY in environment.'
      );
    }

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    };

    logger.debug(
      { model: this.model },
      'Calling OpenAI Chat Completions API'
    );

    const response = await resilientFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        timeout: 30000,
        retries: 2,
        service: 'OpenAI-ChatCompletions',
      }
    );

    if (
      !response ||
      !Array.isArray(response.choices) ||
      response.choices.length === 0
    ) {
      throw new Error(
        'Invalid response structure received from OpenAI Chat Completions API'
      );
    }

    const content = response.choices[0].message?.content;
    if (typeof content !== 'string') {
      throw new Error(
        'OpenAI Chat Completions API returned an empty or invalid message'
      );
    }

    return content.trim();
  }
}

module.exports = { OpenAILLMProvider };
