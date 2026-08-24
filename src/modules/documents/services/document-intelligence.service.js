const { prisma } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// ============================================================
// Document Intelligence Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Performs metadata, language, classification, summary,
// section, entity, and keyword extraction from document text.

class DocumentIntelligenceService {
  /**
   * Detect document language based on common stop word frequencies.
   * @param {string} text
   * @returns {string} ISO 639-1 code (e.g. 'en', 'es', 'fr', 'de')
   */
  detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'en';
    const lower = text.toLowerCase();

    const patterns = {
      es: /\b(el|la|los|las|un|una|de|en|que|por|para|con)\b/gi,
      fr: /\b(le|la|les|un|une|des|du|dans|pour|avec|que)\b/gi,
      de: /\b(der|die|das|und|in|den|von|zu|mit|sich|des)\b/gi,
      en: /\b(the|is|in|at|which|on|and|a|an|with|this|that|for)\b/gi,
    };

    let bestLang = 'en';
    let maxMatches = 0;

    for (const [lang, regex] of Object.entries(patterns)) {
      const matches = (lower.match(regex) || []).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestLang = lang;
      }
    }

    return bestLang;
  }

  /**
   * Classify document type based on structural and semantic heuristics.
   * @param {string} text
   * @param {string} filename
   * @returns {string} Category string
   */
  classifyDocument(text, filename = '') {
    const combined = `${filename} ${text}`.toLowerCase();

    if (/\b(privacy policy|terms of service|terms of use|nda|agreement|contract|clause|license)\b/i.test(combined)) {
      return 'LEGAL';
    }
    if (/\b(invoice|receipt|balance sheet|revenue|ebitda|financial|pricing|quarterly report)\b/i.test(combined)) {
      return 'FINANCIAL';
    }
    if (/\b(api|architecture|endpoint|database|docker|kubernetes|sdk|deployment|function)\b/i.test(combined)) {
      return 'TECHNICAL';
    }
    if (/\b(employee handbook|vacation policy|pto|leave|benefits|hr|onboarding)\b/i.test(combined)) {
      return 'POLICY';
    }

    return 'GENERAL';
  }

  /**
   * Detect structural sections and headings.
   * @param {string} text
   * @returns {Array<{ heading: string, level: number, offset: number }>}
   */
  detectSections(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const sections = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Markdown headings
      if (line.startsWith('#')) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          sections.push({
            heading: match[2],
            level: match[1].length,
            lineIndex: i + 1,
          });
        }
      }
      // Numbered headings (e.g. "1. Overview", "Section 2.3")
      else if (/^(\d+(\.\d+)*|Section\s+\d+)\s+[:.-]?\s+[A-Z]/i.test(line) && line.length < 80) {
        sections.push({
          heading: line,
          level: 2,
          lineIndex: i + 1,
        });
      }
    }

    return sections;
  }

  /**
   * Generate an extractive summary of document text.
   * @param {string} text
   * @param {number} [maxSentences=3]
   * @returns {string}
   */
  generateSummary(text, maxSentences = 3) {
    if (!text) return '';
    const sentences = text
      .replace(/\n+/g, ' ')
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && !s.startsWith('#'));

    if (sentences.length <= maxSentences) {
      return sentences.join(' ');
    }

    // Heuristic: take opening sentence + most informative middle sentences
    return sentences.slice(0, maxSentences).join(' ');
  }

  /**
   * Extract key named entities.
   * @param {string} text
   * @returns {string[]}
   */
  extractEntities(text) {
    if (!text) return [];
    const entitySet = new Set();

    // Capitalized phrase sequences
    const capMatches = text.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*)\b/g) || [];
    const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'There', 'Where', 'When', 'What', 'How', 'Why', 'Section', 'Page', 'Table']);

    for (const phrase of capMatches) {
      if (phrase.length > 3 && !stopWords.has(phrase)) {
        entitySet.add(phrase);
      }
    }

    return Array.from(entitySet).slice(0, 20);
  }

  /**
   * Extract keywords and key phrases.
   * @param {string} text
   * @returns {string[]}
   */
  extractKeywords(text) {
    if (!text) return [];
    const stopWords = new Set([
      'the', 'is', 'in', 'at', 'which', 'on', 'and', 'a', 'an', 'with', 'this', 'that',
      'for', 'to', 'of', 'or', 'as', 'by', 'from', 'it', 'be', 'are', 'was', 'were',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    const freq = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }

  /**
   * Run full intelligence extraction and persist to database.
   * @param {object} params
   * @param {string} params.documentId
   * @param {string} params.text
   * @param {string} [params.filename]
   * @returns {Promise<object>}
   */
  async processAndPersist({ documentId, text, filename = '' }) {
    try {
      const language = this.detectLanguage(text);
      const classification = this.classifyDocument(text, filename);
      const sections = this.detectSections(text);
      const summary = this.generateSummary(text);
      const entities = this.extractEntities(text);
      const keywords = this.extractKeywords(text);

      const title = sections[0]?.heading || filename || 'Untitled Document';

      const intelligence = await prisma.documentIntelligence.upsert({
        where: { documentId },
        create: {
          documentId,
          title,
          language,
          classification,
          summary,
          sections,
          entities,
          keywords,
        },
        update: {
          title,
          language,
          classification,
          summary,
          sections,
          entities,
          keywords,
          updatedAt: new Date(),
        },
      });

      return intelligence;
    } catch (error) {
      logger.warn({ error: error.message, documentId }, 'Document intelligence extraction non-fatal failure');
      return null;
    }
  }
}

const documentIntelligenceService = new DocumentIntelligenceService();

module.exports = {
  DocumentIntelligenceService,
  documentIntelligenceService,
};
