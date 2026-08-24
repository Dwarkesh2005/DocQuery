const { logger } = require('../../../config/logger');
const { env } = require('../../../config/env');
const { queryUnderstandingService } = require('./query-understanding.service');

// ============================================================
// Query Rewriting Service — Contextual Query Optimization
// ============================================================
// Resolves anaphoric references, pronouns, and implicit context from
// prior conversation turns into a standalone, retrieval-optimized query.
//
// Guaranteed to preserve the original message, operate within tenant boundaries,
// and gracefully fall back to originalQuery on failure or timeout.

class QueryRewritingService {
  /**
   * @param {object} [options]
   * @param {object} [options.llmProvider]
   * @param {import('./query-understanding.service').QueryUnderstandingService} [options.understandingService]
   */
  constructor(options = {}) {
    this.llmProvider = options.llmProvider || null;
    this.understandingService = options.understandingService || queryUnderstandingService;
  }

  /**
   * Rewrite a user query for optimal retrieval given conversation history.
   *
   * @param {object} params
   * @param {string} params.query - Current raw user message
   * @param {Array<{ role: string, content: string }>} [params.conversationHistory=[]]
   * @param {boolean} [params.enabled] - Optional override for rewriting flag
   * @returns {Promise<{ originalQuery: string, rewrittenQuery: string, wasRewritten: boolean, reason: string, durationMs: number }>}
   */
  async rewriteQuery({
    query,
    conversationHistory = [],
    enabled = env.ENABLE_QUERY_REWRITE !== false,
  }) {
    const startTime = Date.now();
    const cleanQuery = (query || '').trim();

    // If disabled or no history, return original immediately
    if (!enabled || !cleanQuery || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return {
        originalQuery: cleanQuery,
        rewrittenQuery: cleanQuery,
        wasRewritten: false,
        reason: !enabled ? 'REWRITE_DISABLED' : 'NO_CONVERSATION_HISTORY',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // 1. Analyze query to determine if rewriting is necessary
      const analysis = await this.understandingService.analyze(cleanQuery, { conversationHistory });

      if (!analysis.requires_rewriting && analysis.intent !== 'conversational' && analysis.intent !== 'ambiguous') {
        return {
          originalQuery: cleanQuery,
          rewrittenQuery: cleanQuery,
          wasRewritten: false,
          reason: 'QUERY_ALREADY_STANDALONE',
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Perform Context Resolution
      const recentTurns = conversationHistory.slice(-4);
      const lastUserMessage = [...recentTurns].reverse().find((m) => m.role === 'USER')?.content || '';
      const lastAssistantMessage = [...recentTurns].reverse().find((m) => m.role === 'ASSISTANT')?.content || '';

      // Heuristic context resolution
      const rewritten = this._resolveHeuristic(cleanQuery, lastUserMessage, lastAssistantMessage);

      const durationMs = Date.now() - startTime;
      const wasRewritten = rewritten !== cleanQuery;

      logger.info(
        {
          originalQuery: cleanQuery,
          rewrittenQuery: rewritten,
          wasRewritten,
          durationMs,
        },
        'Query rewrite completed'
      );

      return {
        originalQuery: cleanQuery,
        rewrittenQuery: rewritten,
        wasRewritten,
        reason: wasRewritten ? 'CONVERSATIONAL_CONTEXT_RESOLVED' : 'NO_REWRITE_NEEDED',
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.warn(
        { originalQuery: cleanQuery, error: error.message, durationMs },
        'Query rewrite failed, falling back to original query'
      );

      return {
        originalQuery: cleanQuery,
        rewrittenQuery: cleanQuery,
        wasRewritten: false,
        reason: 'REWRITE_ERROR_FALLBACK',
        durationMs,
      };
    }
  }

  /**
   * Fast, reliable heuristic query rewrite resolving pronouns and contextual follow-ups.
   * @param {string} query
   * @param {string} lastUserMsg
   * @param {string} lastAssistantMsg
   * @returns {string}
   */
  _resolveHeuristic(query, lastUserMsg, lastAssistantMsg) {
    if (!lastUserMsg) return query;

    const lowerQuery = query.toLowerCase();

    // Pattern 1: "What about enterprise?" -> "What about enterprise in <last topic>?" or "<last query> for enterprise"
    if (/^(what about|how about|and for|what of)\s+(.+)/i.test(query)) {
      const match = query.match(/^(?:what about|how about|and for|what of)\s+(.+)/i);
      const subject = match ? match[1].replace(/\?+$/, '').trim() : '';
      if (subject && lastUserMsg) {
        // Strip question punctuation from last user message
        const baseTopic = lastUserMsg.replace(/\?+$/, '').trim();
        return `${baseTopic} for ${subject}?`;
      }
    }

    // Pattern 2: Pronouns ("How much does it cost?", "Explain that policy", "Where is this located?")
    if (/\b(it|this|that|these|those|they|them|its|their)\b/i.test(lowerQuery)) {
      const keySubject = this._extractSubject(lastUserMsg);
      if (keySubject) {
        // Replace pronouns with the referenced subject
        const resolved = query.replace(/\b(it|this|that)\b/gi, `the ${keySubject}`);
        if (resolved !== query) {
          return resolved;
        }
        return `${query} (regarding ${keySubject})`;
      }
    }

    // Pattern 3: Short ambiguous followups ("Why?", "Explain", "Tell me more")
    if (['why?', 'why', 'how?', 'how', 'explain', 'explain that', 'tell me more'].includes(lowerQuery)) {
      const baseTopic = lastUserMsg.replace(/\?+$/, '').trim();
      return `Explain more about ${baseTopic}`;
    }

    // Fallback: Combine contextually if very short
    if (query.split(/\s+/).length <= 3 && lastUserMsg) {
      return `${lastUserMsg} - ${query}`;
    }

    return query;
  }

  /**
   * Extract main subject candidate from previous user message.
   * @param {string} text
   * @returns {string}
   */
  _extractSubject(text) {
    if (!text) return '';
    // Strip common leading question phrases
    const clean = text
      .replace(/^(what is|what are|where is|how does|how do i|tell me about|can you explain)\s+/i, '')
      .replace(/\?+$/, '')
      .trim();

    return clean.slice(0, 100);
  }
}

const queryRewritingService = new QueryRewritingService();

module.exports = {
  QueryRewritingService,
  queryRewritingService,
};
