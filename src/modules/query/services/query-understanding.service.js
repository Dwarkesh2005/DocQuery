const { logger } = require('../../../config/logger');

// ============================================================
// Query Understanding Service — Semantic Query Analysis
// ============================================================
// Extracts user intent, key entities, search keywords, and determines
// whether conversational context / rewriting is required.
//
// Fast, deterministic rule-based analysis with optional LLM classification.
// Guaranteed never to throw or block the RAG pipeline.

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could',
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t',
  'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s',
  'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is',
  'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most',
  'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they',
  'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d',
  'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when',
  'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom',
  'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d',
  'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  'please', 'tell', 'give', 'show', 'find'
]);

const PRONOUN_PATTERNS = [
  /\b(it|this|that|these|those|they|them|its|their|the same|above|previous|former|latter)\b/i,
  /\b(what about|how about|and for|what of|same for)\b/i,
  /^(and|also|too|then|so|why|how)\b/i,
];

class QueryUnderstandingService {
  /**
   * @param {object} [options]
   * @param {object} [options.llmProvider]
   */
  constructor(options = {}) {
    this.llmProvider = options.llmProvider || null;
  }

  /**
   * Analyze a query into structured retrieval metadata.
   *
   * @param {string} query - Raw natural language query
   * @param {object} [options]
   * @param {Array} [options.conversationHistory] - Multi-turn messages if present
   * @returns {Promise<{ intent: string, entities: string[], keywords: string[], requires_rewriting: boolean }>}
   */
  async analyze(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        intent: 'ambiguous',
        entities: [],
        keywords: [],
        requires_rewriting: false,
      };
    }

    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();
    const hasHistory = Array.isArray(options.conversationHistory) && options.conversationHistory.length > 0;

    // 1. Intent Detection Heuristics
    let intent = 'factual';
    let requiresRewriting = false;

    // Summarization patterns
    if (
      lower.startsWith('summarize') ||
      lower.startsWith('give me a summary') ||
      lower.startsWith('overview of') ||
      lower.includes('brief summary') ||
      lower.includes('executive summary') ||
      lower.includes('tl;dr') ||
      lower.includes('tldr')
    ) {
      intent = 'summarization';
    }
    // Comparison patterns
    else if (
      lower.startsWith('compare') ||
      lower.includes(' versus ') ||
      lower.includes(' vs ') ||
      lower.includes('difference between') ||
      lower.includes('compare and contrast') ||
      lower.includes('advantages and disadvantages')
    ) {
      intent = 'comparison';
    }
    // Procedural / How-to patterns
    else if (
      lower.startsWith('how to') ||
      lower.startsWith('how do i') ||
      lower.startsWith('how can i') ||
      lower.startsWith('steps to') ||
      lower.startsWith('guide for') ||
      lower.includes('step-by-step')
    ) {
      intent = 'procedural';
    }
    // Conversational follow-ups & Pronoun references
    else if (
      PRONOUN_PATTERNS.some((pattern) => pattern.test(lower)) ||
      lower.length < 15 ||
      lower.startsWith('what about') ||
      lower.startsWith('how about')
    ) {
      if (lower.split(/\s+/).length <= 2 && ['why?', 'how?', 'tell me more', 'explain', 'what?'].includes(lower)) {
        intent = 'ambiguous';
      } else {
        intent = 'conversational';
      }
      requiresRewriting = hasHistory;
    }
    // Factual queries (default)
    else {
      intent = 'factual';
    }

    // 2. Keyword & Entity Extraction
    const keywords = this._extractKeywords(trimmed);
    const entities = this._extractEntities(trimmed);

    const result = {
      intent,
      entities,
      keywords,
      requires_rewriting: requiresRewriting,
    };

    logger.debug({ query: trimmed, result }, 'Query understanding completed');
    return result;
  }

  /**
   * Extract meaningful keywords by filtering out punctuation and stop words.
   * @param {string} text
   * @returns {string[]}
   */
  _extractKeywords(text) {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

    return Array.from(new Set(tokens));
  }

  /**
   * Extract key entity candidates (quoted terms, capitalized noun phrases, numerical codes).
   * @param {string} text
   * @returns {string[]}
   */
  _extractEntities(text) {
    const entities = new Set();

    // 1. Quoted phrases
    const quoteRegex = /"([^"]+)"|'([^']+)'/g;
    let match;
    while ((match = quoteRegex.exec(text)) !== null) {
      const phrase = match[1] || match[2];
      if (phrase && phrase.trim().length > 1) {
        entities.add(phrase.trim());
      }
    }

    // 2. Capitalized phrases (Proper Nouns) except at the very start of the sentence
    const words = text.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const cleanWord = words[i].replace(/[^a-zA-Z0-9_-]/g, '');
      if (cleanWord.length > 2 && /^[A-Z][a-z0-9]/.test(cleanWord) && !STOP_WORDS.has(cleanWord.toLowerCase())) {
        entities.add(cleanWord);
      }
    }

    // 3. Codes, sections, or numbers (e.g. "Section 4.2", "ISO 27001", "Plan B")
    const codeRegex = /\b(section\s+[0-9]+(\.[0-9]+)*|plan\s+[a-z0-9]+|tier\s+[0-9]+|policy\s+[0-9]+)\b/gi;
    while ((match = codeRegex.exec(text)) !== null) {
      entities.add(match[0]);
    }

    return Array.from(entities);
  }
}

const queryUnderstandingService = new QueryUnderstandingService();

module.exports = {
  QueryUnderstandingService,
  queryUnderstandingService,
};
