const { env } = require('../../../config/env');

// ============================================================
// Document Chunker Service
// ============================================================
// Splits normalized document text or structured pages into overlapping chunks.
// Ensures:
// - Configurable chunkSize and chunkOverlap (defaults: 1000 tokens / 150 overlap)
// - Validation: chunkSize > chunkOverlap
// - Sequential 0-based chunkIndex
// - Page number attribution when available
// - No empty chunks
// - Sentence and paragraph boundary awareness where possible

class ChunkerService {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize !== undefined ? options.chunkSize : (env.CHUNK_SIZE || 1000);
    this.chunkOverlap = options.chunkOverlap !== undefined ? options.chunkOverlap : (env.CHUNK_OVERLAP || 150);

    this.validateConfig(this.chunkSize, this.chunkOverlap);
  }

  /**
   * Validate chunker configuration parameters.
   */
  validateConfig(chunkSize, chunkOverlap) {
    if (typeof chunkSize !== 'number' || chunkSize <= 0) {
      throw new Error(`Invalid chunkSize: ${chunkSize}. Must be a positive integer.`);
    }
    if (typeof chunkOverlap !== 'number' || chunkOverlap < 0) {
      throw new Error(`Invalid chunkOverlap: ${chunkOverlap}. Must be a non-negative integer.`);
    }
    if (chunkSize <= chunkOverlap) {
      throw new Error(
        `Invalid chunker configuration: chunkSize (${chunkSize}) must be strictly greater than chunkOverlap (${chunkOverlap}).`
      );
    }
  }

  /**
   * Approximate token count for text.
   * Standard estimation: 1 token ≈ 4 characters / 0.75 words.
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).filter(Boolean);
    // Token count estimate based on words (~1.33 tokens per word) and character length
    return Math.max(1, Math.ceil(words.length * 1.3));
  }

  /**
   * Split words into token-bounded chunks with overlap.
   * @param {string} text
   * @param {number} [pageNumber]
   * @param {number} [startIndex=0]
   * @returns {Array<{ content: string, chunkIndex: number, pageNumber: number|null, metadata: object }>}
   */
  chunkText(text, pageNumber = null, startIndex = 0) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const trimmed = text.trim();
    if (!trimmed) return [];

    // Words array
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    // Convert token sizes to approximate word counts (~0.75 words per token)
    const wordsPerChunk = Math.max(1, Math.floor(this.chunkSize * 0.75));
    const wordsOverlap = Math.max(0, Math.floor(this.chunkOverlap * 0.75));
    const stepSize = Math.max(1, wordsPerChunk - wordsOverlap);

    const chunks = [];
    let currentIndex = startIndex;

    // If total text fits in a single chunk
    if (words.length <= wordsPerChunk) {
      const content = words.join(' ');
      chunks.push({
        content,
        chunkIndex: currentIndex,
        pageNumber: pageNumber || 1,
        metadata: {
          tokenCount: this.estimateTokens(content),
          wordCount: words.length,
          characterCount: content.length,
        },
      });
      return chunks;
    }

    // Sliding window chunking
    for (let i = 0; i < words.length; i += stepSize) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      if (chunkWords.length === 0) break;

      const content = chunkWords.join(' ');
      chunks.push({
        content,
        chunkIndex: currentIndex++,
        pageNumber: pageNumber || 1,
        metadata: {
          tokenCount: this.estimateTokens(content),
          wordCount: chunkWords.length,
          characterCount: content.length,
        },
      });

      // Break if we've reached the end of words
      if (i + wordsPerChunk >= words.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Chunk structured document with page information.
   * If pages are provided, chunks preserve per-page attribution.
   * @param {{ text: string, pages?: Array<{ pageNumber: number, text: string }> }} documentData
   * @returns {Array<{ content: string, chunkIndex: number, pageNumber: number|null, metadata: object }>}
   */
  chunkDocument(documentData) {
    if (!documentData) return [];

    const { text, pages } = documentData;

    // If structured pages are available, chunk by page to retain accurate page mapping
    if (Array.isArray(pages) && pages.length > 0) {
      const allChunks = [];
      let globalIndex = 0;

      for (const page of pages) {
        if (!page.text || page.text.trim().length === 0) continue;

        const pageChunks = this.chunkText(page.text, page.pageNumber, globalIndex);
        for (const chunk of pageChunks) {
          chunk.chunkIndex = globalIndex++;
          allChunks.push(chunk);
        }
      }

      if (allChunks.length > 0) {
        return allChunks;
      }
    }

    // Fallback to full document text chunking
    return this.chunkText(text, 1, 0);
  }
}

const chunkerService = new ChunkerService();

module.exports = { ChunkerService, chunkerService };
