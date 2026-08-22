const { DocumentCleanerService } = require('../src/modules/documents/services/document-cleaner.service');

describe('DocumentCleanerService', () => {
  let cleaner;

  beforeEach(() => {
    cleaner = new DocumentCleanerService();
  });

  it('should normalize excessive spaces and tabs', () => {
    const raw = 'This   is    a   test   document   with    lots    of   spaces.';
    const cleaned = cleaner.cleanText(raw);
    expect(cleaned).toBe('This is a test document with lots of spaces.');
  });

  it('should normalize Windows CRLF and Mac CR line endings to LF', () => {
    const raw = 'Line 1\r\nLine 2\rLine 3\nLine 4';
    const cleaned = cleaner.cleanText(raw);
    expect(cleaned).toBe('Line 1\nLine 2\nLine 3\nLine 4');
  });

  it('should collapse 3+ consecutive newlines into 2 newlines (paragraph break)', () => {
    const raw = 'Paragraph 1\n\n\n\n\nParagraph 2';
    const cleaned = cleaner.cleanText(raw);
    expect(cleaned).toBe('Paragraph 1\n\nParagraph 2');
  });

  it('should remove null bytes and non-printable control characters', () => {
    const raw = 'Clean\x00text\x07with\x1Fcontrol\x7Fchars';
    const cleaned = cleaner.cleanText(raw);
    expect(cleaned).toBe('Cleantextwithcontrolchars');
  });

  it('should remove zero-width spaces and BOM markers', () => {
    const raw = '\uFEFFHello\u200BWorld\u00A0Test';
    const cleaned = cleaner.cleanText(raw);
    expect(cleaned).toBe('HelloWorld Test');
  });

  it('should preserve meaningful punctuation and casing', () => {
    const raw = 'Section 1.2: Advanced RAG Architecture (v2.0) — What is pgvector? It\'s fast!';
    const cleaned = cleaner.cleanText(raw);
    expect(cleaned).toBe('Section 1.2: Advanced RAG Architecture (v2.0) — What is pgvector? It\'s fast!');
  });

  it('should throw an error if text is empty or contains only whitespace', () => {
    expect(() => cleaner.cleanText('')).toThrow('Document contains no extractable text content');
    expect(() => cleaner.cleanText('   \n\n\t  ')).toThrow('Document contains no meaningful text after cleaning');
  });

  it('should throw an error if text contains only symbols without letters/numbers', () => {
    expect(() => cleaner.cleanText('$$$ %%% @@@ ***')).toThrow('Document contains no meaningful text after cleaning');
  });

  it('should clean structured pages array and filter out blank pages', () => {
    const pages = [
      { pageNumber: 1, text: '  Page 1   content   with spaces.  ' },
      { pageNumber: 2, text: '   \n\n   ' },
      { pageNumber: 3, text: 'Page 3 content.' },
    ];

    const cleanedPages = cleaner.cleanPages(pages);
    expect(cleanedPages).toHaveLength(2);
    expect(cleanedPages[0]).toEqual({
      pageNumber: 1,
      text: 'Page 1 content with spaces.',
    });
    expect(cleanedPages[1]).toEqual({
      pageNumber: 3,
      text: 'Page 3 content.',
    });
  });
});
