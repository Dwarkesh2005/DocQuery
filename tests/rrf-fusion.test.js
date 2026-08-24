const { RRFService } = require('../src/modules/search/services/rrf.service');

describe('Phase 8.6 — Reciprocal Rank Fusion (RRF)', () => {
  let rrf;

  beforeEach(() => {
    rrf = new RRFService();
  });

  it('should mathematically calculate RRF scores for disjoint vector and keyword results', () => {
    const vectorResults = [
      { chunkId: 'c1', documentId: 'd1', content: 'Vector 1', score: 0.95 },
      { chunkId: 'c2', documentId: 'd1', content: 'Vector 2', score: 0.85 },
    ];
    const keywordResults = [
      { chunkId: 'c3', documentId: 'd2', content: 'Keyword 1', score: 0.75 },
      { chunkId: 'c4', documentId: 'd2', content: 'Keyword 2', score: 0.65 },
    ];

    // For k = 60:
    // c1: 1/(60 + 1) = 1/61 ≈ 0.016393
    // c3: 1/(60 + 1) = 1/61 ≈ 0.016393
    // c2: 1/(60 + 2) = 1/62 ≈ 0.016129
    // c4: 1/(60 + 2) = 1/62 ≈ 0.016129
    const fused = rrf.fuseResults(vectorResults, keywordResults, { k: 60 });

    expect(fused.length).toBe(4);
    expect(fused[0].score).toBeCloseTo(1 / 61, 5);
    expect(fused[2].score).toBeCloseTo(1 / 62, 5);
  });

  it('should boost documents that appear in BOTH vector and keyword results', () => {
    const vectorResults = [
      { chunkId: 'c_shared', documentId: 'd1', content: 'Shared result', score: 0.90 }, // rank 1
      { chunkId: 'c_vector_only', documentId: 'd1', content: 'Vector only', score: 0.85 }, // rank 2
    ];
    const keywordResults = [
      { chunkId: 'c_keyword_only', documentId: 'd2', content: 'Keyword only', score: 0.80 }, // rank 1
      { chunkId: 'c_shared', documentId: 'd1', content: 'Shared result', score: 0.70 }, // rank 2
    ];

    // For k = 60:
    // c_shared score = 1/(60+1) + 1/(60+2) = 1/61 + 1/62 ≈ 0.016393 + 0.016129 = 0.032522
    // c_keyword_only score = 1/61 ≈ 0.016393
    // c_vector_only score = 1/62 ≈ 0.016129
    const fused = rrf.fuseResults(vectorResults, keywordResults, { k: 60 });

    expect(fused[0].chunkId).toBe('c_shared');
    expect(fused[0].score).toBeCloseTo((1 / 61) + (1 / 62), 5);
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].keywordRank).toBe(2);
    expect(fused[0].fusedRank).toBe(1);
  });

  it('should respect topK cutoff option', () => {
    const vectorResults = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `v_${i}`,
      documentId: 'd1',
      content: `Content ${i}`,
    }));
    const keywordResults = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `k_${i}`,
      documentId: 'd2',
      content: `Content ${i}`,
    }));

    const fused = rrf.fuseResults(vectorResults, keywordResults, { topK: 5 });
    expect(fused.length).toBe(5);
  });

  it('should handle empty input arrays gracefully', () => {
    const fused1 = rrf.fuseResults([], []);
    expect(fused1).toEqual([]);

    const fused2 = rrf.fuseResults(null, undefined);
    expect(fused2).toEqual([]);
  });
});
