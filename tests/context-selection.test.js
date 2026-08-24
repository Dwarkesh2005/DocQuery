const { ContextSelectorService } = require('../src/modules/query/services/context-selector.service');

describe('Phase 8.8 — Context Selection & Token Budgeting', () => {
  let selector;

  beforeEach(() => {
    selector = new ContextSelectorService();
  });

  it('should enforce maxChunks hard limit', () => {
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      chunkId: `c_${i}`,
      documentId: `doc_${i}`,
      content: `Unique chunk content ${i}`,
      score: 0.9 - i * 0.01,
    }));

    const result = selector.selectContext(candidates, { maxChunks: 5, maxTokens: 10000 });

    expect(result.selectedCount).toBe(5);
    expect(result.selectedChunks.length).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it('should enforce maxTokens budget constraint strictly', () => {
    const longChunkText = 'A'.repeat(800); // approx 200 tokens each
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `c_${i}`,
      documentId: `doc_${i}`,
      content: `Chunk ${i}: ${longChunkText}`,
      score: 0.9 - i * 0.01,
    }));

    // Cap at 450 tokens (~2 chunks)
    const result = selector.selectContext(candidates, { maxChunks: 10, maxTokens: 450 });

    expect(result.selectedCount).toBeLessThanOrEqual(3);
    expect(result.totalTokens).toBeLessThanOrEqual(450);
    expect(result.truncated).toBe(true);
  });

  it('should filter out duplicate chunk IDs and duplicate content snippets', () => {
    const candidates = [
      { chunkId: 'c1', documentId: 'd1', content: 'Unique content 1', score: 0.9 },
      { chunkId: 'c1', documentId: 'd1', content: 'Unique content 1', score: 0.85 }, // duplicate ID
      { chunkId: 'c2', documentId: 'd1', content: 'Unique content 1', score: 0.80 }, // duplicate content
      { chunkId: 'c3', documentId: 'd2', content: 'Unique content 2', score: 0.75 },
    ];

    const result = selector.selectContext(candidates, { maxChunks: 10 });

    expect(result.selectedCount).toBe(2);
    expect(result.selectedChunks.map((c) => c.chunkId)).toEqual(['c1', 'c3']);
  });

  it('should preserve citation and metadata properties on all selected chunks', () => {
    const candidates = [
      {
        chunkId: 'c1',
        documentId: 'd1',
        content: 'Employee leave policy overview.',
        score: 0.95,
        pageNumber: 12,
        chunkIndex: 2,
        metadata: { documentName: 'handbook.pdf', section: 'Leave' },
      },
    ];

    const result = selector.selectContext(candidates);

    expect(result.selectedChunks[0].chunkId).toBe('c1');
    expect(result.selectedChunks[0].documentId).toBe('d1');
    expect(result.selectedChunks[0].pageNumber).toBe(12);
    expect(result.selectedChunks[0].chunkIndex).toBe(2);
    expect(result.selectedChunks[0].metadata.documentName).toBe('handbook.pdf');
  });

  it('should return empty selection when candidates array is empty', () => {
    const result = selector.selectContext([]);
    expect(result.selectedCount).toBe(0);
    expect(result.selectedChunks).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
