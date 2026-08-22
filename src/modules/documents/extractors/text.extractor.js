const fs = require('fs/promises');
const { BaseExtractor } = require('./base.extractor');

// ============================================================
// Plain Text & Markdown Extractor
// ============================================================
// Handles raw text, markdown, CSV, and text-based documents.

class TextExtractor extends BaseExtractor {
  /**
   * @param {string} mimeType
   * @param {string} [extension]
   * @returns {boolean}
   */
  supports(mimeType, extension) {
    const textMimes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/html',
      'application/json',
    ];
    const textExtensions = ['.txt', '.md', '.markdown', '.csv', '.json', '.log'];

    if (textMimes.includes(mimeType)) return true;
    if (extension && textExtensions.includes(extension.toLowerCase())) return true;
    return false;
  }

  /**
   * Extract text from buffer or file path.
   * @param {Buffer|string} source
   * @returns {Promise<{ text: string, pageCount: number, pages: Array<{ pageNumber: number, text: string }> }>}
   */
  async extract(source) {
    let content;
    if (Buffer.isBuffer(source)) {
      content = source.toString('utf-8');
    } else if (typeof source === 'string') {
      content = await fs.readFile(source, 'utf-8');
    } else {
      throw new Error('Invalid source provided to TextExtractor: must be Buffer or file path string');
    }

    if (!content || content.trim().length === 0) {
      throw new Error('Text document is empty');
    }

    return {
      text: content,
      pageCount: 1,
      pages: [{ pageNumber: 1, text: content }],
    };
  }
}

module.exports = { TextExtractor };
