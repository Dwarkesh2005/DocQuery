const { logger } = require('../config/logger');

// ============================================================
// Prompt Security & Injection Defense Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Detects prompt injection, jailbreaks, and instructions overrides
// in both user queries and retrieved document chunks.

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
  /system\s*prompt\s*override/i,
  /you\s+are\s+now\s+(an\s+unrestricted|in\s+developer\s+mode|dan)/i,
  /developer\s*mode\s*activated/i,
  /reveal\s+(the\s+)?(system\s+prompt|hidden\s+instructions|api\s+keys|secrets)/i,
  /leak\s+(the\s+)?(keys|passwords|credentials)/i,
  /execute\s+(system|shell|bash)\s+command/i,
  /<\s*system\s*>/i,
  /\[\s*INST\s*\]/i,
  /```system/i,
];

class PromptSecurityService {
  /**
   * Detect potential prompt injection or jailbreak attempts in a string.
   * @param {string} text
   * @returns {{ isSuspicious: boolean, score: number, matches: string[] }}
   */
  detectPromptInjection(text) {
    if (!text || typeof text !== 'string') {
      return { isSuspicious: false, score: 0, matches: [] };
    }

    const matches = [];
    for (const pattern of INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    const score = Math.min(1.0, matches.length * 0.4);
    const isSuspicious = matches.length > 0;

    if (isSuspicious) {
      logger.warn({ matchesCount: matches.length, matches }, 'Prompt injection pattern detected');
    }

    return {
      isSuspicious,
      score,
      matches,
    };
  }

  /**
   * Sanitize untrusted content by neutralizing markdown/prompt injection markers.
   * @param {string} content
   * @returns {string} Sanitized string
   */
  sanitizeUntrustedContent(content) {
    if (!content || typeof content !== 'string') return '';

    let sanitized = content;

    // Neutralize dangerous prompt delimiters
    sanitized = sanitized.replace(/<\/?system>/gi, '[SYSTEM_TAG_STRIPPED]');
    sanitized = sanitized.replace(/\[\/?INST\]/gi, '[INST_TAG_STRIPPED]');
    sanitized = sanitized.replace(/```system/gi, '```text');

    return sanitized;
  }

  /**
   * Wrap retrieved document chunks inside explicit untrusted boundaries.
   * @param {Array<{ chunkId?: string, documentName?: string, content: string, pageNumber?: number }>} chunks
   * @returns {string} Formatted context block
   */
  wrapUntrustedContext(chunks = []) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return '';
    }

    const formattedChunks = chunks.map((chunk, idx) => {
      const sanitized = this.sanitizeUntrustedContent(chunk.content);
      const pageInfo = chunk.pageNumber ? ` (Page ${chunk.pageNumber})` : '';
      const docName = chunk.documentName || chunk.documentId || `Document ${idx + 1}`;

      return `[Chunk ${idx + 1} | Source: ${docName}${pageInfo}]\n${sanitized}`;
    });

    return `<<<UNTRUSTED_DOCUMENT_CONTENT>>>\n${formattedChunks.join('\n\n')}\n<<<END_UNTRUSTED_DOCUMENT_CONTENT>>>`;
  }
}

const promptSecurityService = new PromptSecurityService();

module.exports = {
  PromptSecurityService,
  promptSecurityService,
  INJECTION_PATTERNS,
};
