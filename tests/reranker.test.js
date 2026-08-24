const { ScoreReranker } = require('../src/modules/query/rerankers/score.reranker');
const { CohereReranker } = require('../src/modules/query/rerankers/cohere.reranker');
const { RerankerFactory } = require('../src/modules/query/rerankers/reranker.factory');

describe('Phase 8.7 — Reranker Layer', () => {
  describe('ScoreReranker (Heuristic Local)', () => {
    it('should promote chunks with high keyword overlap and exact matches to the top rank', async () => {
      const reranker = new ScoreReranker();
      const query = 'refund policy 30 days';

      const documents = [
        {
          chunkId: 'c1',
          documentId: 'd1',
          content: 'The company handbook outlines general employee office conduct.',
          score: 0.8,
        },
        {
          chunkId: 'c2',
          documentId: 'd2',
          content: 'Our standard refund policy permits customers to claim a full refund within 30 days of purchase.',
          score: 0.6, // Lower initial retrieval score, but highly relevant content
        },
      ];

      const reranked = await reranker.rerank(query, documents);

      expect(reranked.length).toBe(2);
      expect(reranked[0].chunkId).toBe('c2'); // c2 should be promoted to rank 1
      expect(reranked[0].rank).toBe(1);
      expect(reranked[0].score).toBeGreaterThan(reranked[1].score);
    });

    it('should handle empty document lists safely', async () => {
      const reranker = new ScoreReranker();
      const result = await reranker.rerank('test query', []);
      expect(result).toEqual([]);
    });
  });

  describe('CohereReranker (Fallback Behavior)', () => {
    it('should automatically fall back to ScoreReranker when no API key is provided', async () => {
      const cohereReranker = new CohereReranker({ apiKey: null });
      const query = 'health insurance';
      const documents = [
        { chunkId: 'c1', content: 'Random unhelpful text' },
        { chunkId: 'c2', content: 'Comprehensive health insurance coverage details' },
      ];

      const reranked = await cohereReranker.rerank(query, documents);

      expect(reranked.length).toBe(2);
      expect(reranked[0].chunkId).toBe('c2');
    });
  });

  describe('RerankerFactory', () => {
    it('should instantiate appropriate reranker based on provider name', () => {
      const scoreReranker = RerankerFactory.getReranker('score');
      expect(scoreReranker.name).toBe('ScoreReranker');

      const cohereReranker = RerankerFactory.getReranker('cohere');
      expect(cohereReranker.name).toBe('CohereReranker');
    });
  });
});
