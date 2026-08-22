const path = require('path');
const { PDFExtractor } = require('./pdf.extractor');
const { TextExtractor } = require('./text.extractor');

// ============================================================
// Extractor Factory
// ============================================================
// Selects and instantiates the appropriate extractor strategy based on
// MIME type and/or file extension.

class ExtractorFactory {
  constructor() {
    this.extractors = [
      new PDFExtractor(),
      new TextExtractor(),
    ];
  }

  /**
   * Register an extractor strategy.
   * @param {import('./base.extractor').BaseExtractor} extractor
   */
  register(extractor) {
    this.extractors.unshift(extractor);
  }

  /**
   * Get the appropriate extractor for the given file metadata.
   * @param {string} mimeType
   * @param {string} [filename]
   * @returns {import('./base.extractor').BaseExtractor}
   */
  getExtractor(mimeType, filename) {
    const ext = filename ? path.extname(filename).toLowerCase() : undefined;

    for (const extractor of this.extractors) {
      if (extractor.supports(mimeType, ext)) {
        return extractor;
      }
    }

    throw new Error(`Unsupported document format: MIME type "${mimeType}"${filename ? `, file "${filename}"` : ''}`);
  }
}

const extractorFactory = new ExtractorFactory();

module.exports = { ExtractorFactory, extractorFactory };
