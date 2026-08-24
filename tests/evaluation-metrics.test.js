const { RetrievalMetrics } = require('../src/modules/evaluations/metrics/retrieval.metrics');
const { GenerationMetrics } = require('../src/modules/evaluations/metrics/generation.metrics');

describe('Phase 8.11 — RAG Evaluation Metrics', () => {
  describe('Retrieval Metrics', () => {
    it('should calculate Precision@K correctly', () => {
      const retrieved = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5'];
      const expected = ['doc-1', 'doc-3', 'doc-9'];

      // In top 5: doc-1 and doc-3 are relevant -> 2 / 5 = 0.4
      expect(RetrievalMetrics.precisionAtK(retrieved, expected, 5)).toBe(0.4);

      // In top 2: doc-1 is relevant -> 1 / 2 = 0.5
      expect(RetrievalMetrics.precisionAtK(retrieved, expected, 2)).toBe(0.5);

      // In top 1: doc-1 is relevant -> 1 / 1 = 1.0
      expect(RetrievalMetrics.precisionAtK(retrieved, expected, 1)).toBe(1.0);
    });

    it('should calculate Recall@K correctly', () => {
      const retrieved = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5'];
      const expected = ['doc-1', 'doc-3', 'doc-9', 'doc-10']; // 4 total relevant

      // In top 5: 2 out of 4 expected retrieved -> 2 / 4 = 0.5
      expect(RetrievalMetrics.recallAtK(retrieved, expected, 5)).toBe(0.5);

      // In top 1: 1 out of 4 expected retrieved -> 1 / 4 = 0.25
      expect(RetrievalMetrics.recallAtK(retrieved, expected, 1)).toBe(0.25);
    });

    it('should calculate Reciprocal Rank & Mean Reciprocal Rank (MRR)', () => {
      // Query 1: First relevant at rank 1 -> RR = 1/1 = 1.0
      const rr1 = RetrievalMetrics.reciprocalRank(['d1', 'd2', 'd3'], ['d1']);
      expect(rr1).toBe(1.0);

      // Query 2: First relevant at rank 2 -> RR = 1/2 = 0.5
      const rr2 = RetrievalMetrics.reciprocalRank(['d9', 'd2', 'd3'], ['d2']);
      expect(rr2).toBe(0.5);

      // Query 3: First relevant at rank 4 -> RR = 1/4 = 0.25
      const rr3 = RetrievalMetrics.reciprocalRank(['d9', 'd8', 'd7', 'd4'], ['d4']);
      expect(rr3).toBe(0.25);

      // Query 4: Not found -> RR = 0
      const rr4 = RetrievalMetrics.reciprocalRank(['d9', 'd8'], ['d1']);
      expect(rr4).toBe(0.0);

      // MRR across [1.0, 0.5, 0.25, 0.0] = 1.75 / 4 = 0.4375
      const mrr = RetrievalMetrics.meanReciprocalRank([
        { retrievedIds: ['d1'], expectedIds: ['d1'] },
        { retrievedIds: ['d9', 'd2'], expectedIds: ['d2'] },
        { retrievedIds: ['d9', 'd8', 'd7', 'd4'], expectedIds: ['d4'] },
        { retrievedIds: ['d9', 'd8'], expectedIds: ['d1'] },
      ]);
      expect(mrr).toBe(0.4375);
    });

    it('should calculate Hit Rate accurately', () => {
      expect(RetrievalMetrics.hitRate(['d1', 'd2'], ['d1'])).toBe(1.0);
      expect(RetrievalMetrics.hitRate(['d2', 'd3'], ['d1'])).toBe(0.0);
    });
  });

  describe('Generation Metrics', () => {
    let genEvaluator;

    beforeEach(() => {
      genEvaluator = new GenerationMetrics();
    });

    it('should evaluate grounded answers with high faithfulness and context utilization', async () => {
      const question = 'What is the refund policy?';
      const retrievedChunks = [
        {
          chunkId: 'c1',
          content: 'Customers may request a full refund within 30 calendar days of invoice date.',
        },
      ];
      const citations = [{ chunkId: 'c1' }];
      const generatedAnswer = 'According to the policy, customers may request a full refund within 30 calendar days.';

      const result = await genEvaluator.evaluate({
        question,
        generatedAnswer,
        retrievedChunks,
        citations,
        expectedAnswer: '30 days refund',
      });

      expect(result.answerRelevance).toBeGreaterThan(0.7);
      expect(result.faithfulness).toBeGreaterThan(0.8);
      expect(result.contextUtilization).toBe(1.0);
      expect(result.overallScore).toBeGreaterThan(0.7);
    });

    it('should recognize ungrounded answers and yield lower faithfulness', async () => {
      const question = 'What are the company holiday hours?';
      const retrievedChunks = [
        {
          chunkId: 'c1',
          content: 'The company is closed on December 25 and January 1.',
        },
      ];
      const citations = [];
      const hallucinatedAnswer =
        'The company is open 24/7 every day including Christmas, Easter, and Thanksgiving.';

      const result = await genEvaluator.evaluate({
        question,
        generatedAnswer: hallucinatedAnswer,
        retrievedChunks,
        citations,
      });

      expect(result.faithfulness).toBeLessThan(0.5);
    });

    it('should handle empty answers gracefully', async () => {
      const result = await genEvaluator.evaluate({
        question: 'Test?',
        generatedAnswer: '',
        retrievedChunks: [],
      });

      expect(result.overallScore).toBe(0.0);
      expect(result.answerRelevance).toBe(0.0);
    });
  });
});
