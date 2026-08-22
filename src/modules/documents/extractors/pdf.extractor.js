const fs = require('fs/promises');
const pdf = require('pdf-parse');
const { BaseExtractor } = require('./base.extractor');

// ============================================================
// PDF Document Extractor
// ============================================================
// Extracts text and preserves page-level structure from PDF documents.

class PDFExtractor extends BaseExtractor {
  /**
   * @param {string} mimeType
   * @param {string} [extension]
   * @returns {boolean}
   */
  supports(mimeType, extension) {
    return (
      mimeType === 'application/pdf' ||
      (typeof extension === 'string' && extension.toLowerCase() === '.pdf')
    );
  }

  /**
   * Extract text from PDF buffer or file path.
   * @param {Buffer|string} source
   * @returns {Promise<{ text: string, pageCount: number, pages: Array<{ pageNumber: number, text: string }> }>}
   */
  async extract(source) {
    let buffer;
    if (Buffer.isBuffer(source)) {
      buffer = source;
    } else if (typeof source === 'string') {
      buffer = await fs.readFile(source);
    } else {
      throw new Error('Invalid source provided to PDFExtractor: must be Buffer or file path string');
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('PDF file is empty (0 bytes)');
    }

    const pages = [];
    let pageCounter = 1;

    const pagerender = function (pageData) {
      return pageData.getTextContent().then(function (textContent) {
        let lastY;
        let text = '';
        for (const item of textContent.items) {
          if (lastY === undefined || lastY === item.transform[5]) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }
        pages.push({
          pageNumber: pageCounter++,
          text: text.trim(),
        });
        return text;
      });
    };

    try {
      const data = await pdf(new Uint8Array(buffer), { pagerender });

      const totalPages = data.numpages || pages.length || 1;
      const rawText = data.text || '';

      return {
        text: rawText,
        pageCount: totalPages,
        pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: rawText }],
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }
}

module.exports = { PDFExtractor };
