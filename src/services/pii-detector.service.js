const { logger } = require('../config/logger');

// ============================================================
// PII & Sensitive Data Protection Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Detects emails, phone numbers, credit card patterns, API keys,
// and supports ALLOW, WARN, REDACT, and BLOCK modes.

const PII_PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  PHONE: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  API_KEY: /\b(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|dq_live_[a-zA-Z0-9_]{20,}|Bearer\s+[a-zA-Z0-9._-]{20,})\b/g,
};

class PiiDetectorService {
  /**
   * Scan text for PII entities.
   * @param {string} text
   * @returns {{ hasPii: boolean, matches: Record<string, string[]>, totalCount: number }}
   */
  detect(text) {
    if (!text || typeof text !== 'string') {
      return { hasPii: false, matches: {}, totalCount: 0 };
    }

    const matches = {};
    let totalCount = 0;

    for (const [type, regex] of Object.entries(PII_PATTERNS)) {
      const found = text.match(regex) || [];
      if (found.length > 0) {
        matches[type] = found;
        totalCount += found.length;
      }
    }

    return {
      hasPii: totalCount > 0,
      matches,
      totalCount,
    };
  }

  /**
   * Redact sensitive PII and secrets from text.
   * @param {string} text
   * @returns {string} Text with redacted masks
   */
  redact(text) {
    if (!text || typeof text !== 'string') return '';

    let redacted = text;

    redacted = redacted.replace(PII_PATTERNS.API_KEY, '[API_KEY_REDACTED]');
    redacted = redacted.replace(PII_PATTERNS.CREDIT_CARD, '[CREDIT_CARD_REDACTED]');
    redacted = redacted.replace(PII_PATTERNS.SSN, '[SSN_REDACTED]');
    redacted = redacted.replace(PII_PATTERNS.EMAIL, '[EMAIL_REDACTED]');
    redacted = redacted.replace(PII_PATTERNS.PHONE, '[PHONE_REDACTED]');

    return redacted;
  }

  /**
   * Process text according to configured mode.
   * @param {string} text
   * @param {string} [mode='REDACT'] - 'ALLOW' | 'WARN' | 'REDACT' | 'BLOCK'
   * @returns {{ text: string, flagged: boolean }}
   */
  process(text, mode = 'REDACT') {
    const detection = this.detect(text);

    if (!detection.hasPii) {
      return { text, flagged: false };
    }

    if (mode === 'BLOCK') {
      const error = new Error('Sensitive PII or secrets detected in payload');
      error.statusCode = 400;
      error.code = 'PII_DETECTED_BLOCKED';
      throw error;
    }

    if (mode === 'WARN') {
      logger.warn({ piiMatchesCount: detection.totalCount }, 'PII detected in text payload');
      return { text, flagged: true };
    }

    if (mode === 'REDACT') {
      return {
        text: this.redact(text),
        flagged: true,
      };
    }

    // Default ALLOW
    return { text, flagged: true };
  }
}

const piiDetectorService = new PiiDetectorService();

module.exports = {
  PiiDetectorService,
  piiDetectorService,
  PII_PATTERNS,
};
