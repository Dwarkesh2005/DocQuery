const PDFDocument = require('pdfkit');
const { ExtractorFactory } = require('../src/modules/documents/extractors/extractor.factory');
const { PDFExtractor } = require('../src/modules/documents/extractors/pdf.extractor');
const { TextExtractor } = require('../src/modules/documents/extractors/text.extractor');

const { PassThrough } = require('stream');

// Helper to generate a small PDF buffer in-memory using PDFKit
function generateTestPDF(pagesText = ['Hello from page 1', 'Hello from page 2']) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = new PassThrough();
    const buffers = [];

    stream.on('data', (chunk) => buffers.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(buffers)));
    stream.on('error', reject);

    doc.pipe(stream);

    pagesText.forEach((pageText, index) => {
      if (index > 0) doc.addPage();
      doc.fontSize(14).text(pageText, 50, 50);
    });

    doc.end();
  });
}

describe('Extractor Architecture', () => {
  let factory;

  beforeEach(() => {
    factory = new ExtractorFactory();
  });

  describe('ExtractorFactory', () => {
    it('should select PDFExtractor for application/pdf and .pdf files', () => {
      const extractorByMime = factory.getExtractor('application/pdf');
      const extractorByExt = factory.getExtractor('application/octet-stream', 'manual.pdf');

      expect(extractorByMime).toBeInstanceOf(PDFExtractor);
      expect(extractorByExt).toBeInstanceOf(PDFExtractor);
    });

    it('should select TextExtractor for text MIME types and markdown files', () => {
      const textExtractor = factory.getExtractor('text/plain');
      const mdExtractor = factory.getExtractor('application/octet-stream', 'notes.md');

      expect(textExtractor).toBeInstanceOf(TextExtractor);
      expect(mdExtractor).toBeInstanceOf(TextExtractor);
    });

    it('should throw for unsupported document types', () => {
      expect(() => factory.getExtractor('image/png', 'photo.png')).toThrow(
        /Unsupported document format/
      );
    });
  });

  describe('TextExtractor', () => {
    const textExtractor = new TextExtractor();

    it('should extract text from a string or buffer', async () => {
      const content = '# Title\n\nThis is a sample markdown document.';
      const result = await textExtractor.extract(Buffer.from(content, 'utf-8'));

      expect(result.text).toBe(content);
      expect(result.pageCount).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].text).toBe(content);
    });

    it('should throw an error for empty text buffer', async () => {
      await expect(textExtractor.extract(Buffer.from('', 'utf-8'))).rejects.toThrow(
        'Text document is empty'
      );
    });
  });

  describe('PDFExtractor', () => {
    const pdfExtractor = new PDFExtractor();

    it('should extract structured text and pages from a valid PDF', async () => {
      const pdfBuffer = await generateTestPDF(['First Page Content', 'Second Page Content']);
      const result = await pdfExtractor.extract(pdfBuffer);

      expect(result.pageCount).toBe(2);
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[0].text).toContain('First Page Content');
      expect(result.pages[1].pageNumber).toBe(2);
      expect(result.pages[1].text).toContain('Second Page Content');
      expect(result.text).toContain('First Page Content');
      expect(result.text).toContain('Second Page Content');
    });

    it('should fail cleanly when given corrupted PDF data', async () => {
      const corruptBuffer = Buffer.from('NOT_A_REAL_PDF_DATA_HEADER');
      await expect(pdfExtractor.extract(corruptBuffer)).rejects.toThrow(
        /PDF extraction failed/
      );
    });

    it('should fail cleanly when given empty PDF buffer', async () => {
      await expect(pdfExtractor.extract(Buffer.alloc(0))).rejects.toThrow(
        'PDF file is empty (0 bytes)'
      );
    });
  });
});
