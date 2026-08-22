// ============================================================
// Base Document Extractor
// ============================================================
// Abstract base class defining the contract for document extractors.

class BaseExtractor {
  /**
   * Extract structured text content from a file buffer or path.
   * @param {Buffer|string} _source - File buffer or file path
   * @param {object} [_options]
   * @returns {Promise<{ text: string, pageCount: number, pages: Array<{ pageNumber: number, text: string }> }>}
   */
  async extract(_source, _options = {}) {
    throw new Error('Method "extract" must be implemented by concrete extractor subclass');
  }

  /**
   * Check if this extractor supports a given MIME type or file extension.
   * @param {string} _mimeType
   * @param {string} [_extension]
   * @returns {boolean}
   */
  supports(_mimeType, _extension) {
    return false;
  }
}

module.exports = { BaseExtractor };
