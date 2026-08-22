const { ChunkerService } = require('../src/modules/documents/services/chunker.service');

describe('ChunkerService', () => {
  it('should validate that chunkSize must be greater than chunkOverlap', () => {
    expect(() => new ChunkerService({ chunkSize: 100, chunkOverlap: 100 })).toThrow(
      /chunkSize .* must be strictly greater than chunkOverlap/
    );
    expect(() => new ChunkerService({ chunkSize: 50, chunkOverlap: 100 })).toThrow(
      /chunkSize .* must be strictly greater than chunkOverlap/
    );
    expect(() => new ChunkerService({ chunkSize: 0, chunkOverlap: 0 })).toThrow(
      /Invalid chunkSize/
    );
    expect(() => new ChunkerService({ chunkSize: 100, chunkOverlap: -1 })).toThrow(
      /Invalid chunkOverlap/
    );
  });

  it('should create a single chunk for short documents', () => {
    const chunker = new ChunkerService({ chunkSize: 1000, chunkOverlap: 150 });
    const text = 'This is a short document that easily fits into a single chunk of text.';
    const chunks = chunker.chunkText(text, 1, 0);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].metadata.wordCount).toBe(14);
    expect(chunks[0].metadata.tokenCount).toBeGreaterThan(0);
  });

  it('should split long documents into multiple sequential chunks with overlap', () => {
    const chunker = new ChunkerService({ chunkSize: 50, chunkOverlap: 10 }); // ~37 words/chunk, ~7 words overlap
    const words = Array.from({ length: 150 }, (_, i) => `word${i + 1}`);
    const text = words.join(' ');

    const chunks = chunker.chunkText(text, 1, 0);

    expect(chunks.length).toBeGreaterThan(1);
    // Verify sequential indexes
    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
      expect(chunk.content.length).toBeGreaterThan(0);
    });

    // Check overlap between chunk 0 and chunk 1
    const chunk0Words = chunks[0].content.split(' ');
    const chunk1Words = chunks[1].content.split(' ');
    const lastWordChunk0 = chunk0Words[chunk0Words.length - 1];

    // Chunk 1 should contain some words from the end of chunk 0
    expect(chunk1Words.includes(lastWordChunk0)).toBe(true);
  });

  it('should preserve page numbers when chunking structured multi-page document', () => {
    const chunker = new ChunkerService({ chunkSize: 50, chunkOverlap: 10 });
    const pages = [
      { pageNumber: 1, text: 'Page one text content that goes here.' },
      { pageNumber: 2, text: 'Page two text content that has more details.' },
      { pageNumber: 3, text: 'Page three final summary text.' },
    ];

    const chunks = chunker.chunkDocument({ pages, text: 'Full text fallback' });

    expect(chunks).toHaveLength(3);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].pageNumber).toBe(2);
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks[2].pageNumber).toBe(3);
    expect(chunks[2].chunkIndex).toBe(2);
  });

  it('should handle empty input safely without creating empty chunks', () => {
    const chunker = new ChunkerService();
    expect(chunker.chunkText('')).toEqual([]);
    expect(chunker.chunkText('   ')).toEqual([]);
    expect(chunker.chunkDocument(null)).toEqual([]);
  });
});
