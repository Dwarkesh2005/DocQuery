// ============================================================
// Document Text Cleaner Service
// ============================================================
// Normalizes raw extracted document text:
// - Removes null bytes and unprintable control characters
// - Normalizes Windows/Mac line endings (\r\n -> \n)
// - Collapses excessive spaces and tabs
// - Normalizes 3+ consecutive newlines to 2 newlines
// - Preserves meaningful punctuation and structure
// - Throws controlled error if content has no meaningful text

class DocumentCleanerService {
  /**
   * Clean and normalize raw extracted text.
   * @param {string} rawText
   * @returns {string}
   */
  cleanText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Document contains no extractable text content');
    }

    let cleaned = rawText;

    // 1. Remove null bytes and non-printable control characters (keep \t, \n, \r)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 2. Normalize carriage returns (\r\n -> \n, \r -> \n)
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 3. Remove zero-width spaces, byte order marks, and non-breaking spaces
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
    cleaned = cleaned.replace(/\u00A0/g, ' ');

    // 4. Normalize trailing spaces on lines
    cleaned = cleaned
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n');

    // 5. Collapse 3 or more consecutive newlines into 2 (paragraph break)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 6. Trim leading/trailing whitespace
    cleaned = cleaned.trim();

    // 7. Validate that cleaned text has meaningful content
    // At least one alphanumeric character
    if (!cleaned || !/[a-zA-Z0-9\p{L}]/u.test(cleaned)) {
      throw new Error('Document contains no meaningful text after cleaning');
    }

    return cleaned;
  }

  /**
   * Clean structured pages array.
   * @param {Array<{ pageNumber: number, text: string }>} pages
   * @returns {Array<{ pageNumber: number, text: string }>}
   */
  cleanPages(pages) {
    if (!Array.isArray(pages) || pages.length === 0) {
      return [];
    }

    const cleanedPages = [];
    for (const page of pages) {
      try {
        const cleanedText = this.cleanText(page.text || '');
        if (cleanedText.length > 0) {
          cleanedPages.push({
            pageNumber: page.pageNumber,
            text: cleanedText,
          });
        }
      } catch {
        // Skip completely empty pages in per-page array, but continue processing other pages
      }
    }

    return cleanedPages;
  }
}

const documentCleanerService = new DocumentCleanerService();

module.exports = { DocumentCleanerService, documentCleanerService };
