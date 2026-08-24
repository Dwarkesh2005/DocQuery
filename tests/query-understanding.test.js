const { QueryUnderstandingService } = require('../src/modules/query/services/query-understanding.service');

describe('Phase 8.1 — Query Understanding Service', () => {
  let service;

  beforeEach(() => {
    service = new QueryUnderstandingService();
  });

  describe('Intent Detection', () => {
    it('should classify factual questions as "factual"', async () => {
      const result = await service.analyze('What are the standard payment terms for vendor invoices?');
      expect(result.intent).toBe('factual');
      expect(result.requires_rewriting).toBe(false);
      expect(result.keywords).toContain('payment');
      expect(result.keywords).toContain('terms');
      expect(result.keywords).toContain('vendor');
      expect(result.keywords).toContain('invoices');
    });

    it('should classify summarization queries as "summarization"', async () => {
      const result = await service.analyze('Summarize the company vacation policy for full-time employees');
      expect(result.intent).toBe('summarization');
      expect(result.requires_rewriting).toBe(false);
    });

    it('should classify comparison queries as "comparison"', async () => {
      const result = await service.analyze('What is the difference between Plan A vs Plan B?');
      expect(result.intent).toBe('comparison');
      expect(result.requires_rewriting).toBe(false);
    });

    it('should classify procedural questions as "procedural"', async () => {
      const result = await service.analyze('How do I submit an expense report in the portal?');
      expect(result.intent).toBe('procedural');
      expect(result.requires_rewriting).toBe(false);
    });

    it('should classify pronoun follow-ups as "conversational" and flag requires_rewriting when history exists', async () => {
      const history = [{ role: 'USER', content: 'Tell me about the health insurance plan.' }];
      const result = await service.analyze('What about for dental and vision?', { conversationHistory: history });
      expect(result.intent).toBe('conversational');
      expect(result.requires_rewriting).toBe(true);
    });

    it('should classify short vague queries as "ambiguous"', async () => {
      const result = await service.analyze('Why?');
      expect(result.intent).toBe('ambiguous');
    });
  });

  describe('Entity & Keyword Extraction', () => {
    it('should extract quoted phrases as entities', async () => {
      const result = await service.analyze('Where is the "Employee Code of Conduct" located?');
      expect(result.entities).toContain('Employee Code of Conduct');
    });

    it('should extract section/code identifiers as entities', async () => {
      const result = await service.analyze('Explain Section 4.2 regarding termination rights');
      expect(result.entities).toContain('Section 4.2');
    });

    it('should filter out stop words and return distinct meaningful keywords', async () => {
      const result = await service.analyze('What is the refund policy for all customers in our platform?');
      expect(result.keywords).toContain('refund');
      expect(result.keywords).toContain('policy');
      expect(result.keywords).toContain('customers');
      expect(result.keywords).toContain('platform');
      expect(result.keywords).not.toContain('what');
      expect(result.keywords).not.toContain('is');
      expect(result.keywords).not.toContain('the');
      expect(result.keywords).not.toContain('for');
    });
  });

  describe('Edge Case Safety', () => {
    it('should handle empty or null input gracefully without throwing', async () => {
      const resNull = await service.analyze(null);
      expect(resNull.intent).toBe('ambiguous');
      expect(resNull.keywords).toEqual([]);

      const resEmpty = await service.analyze('   ');
      expect(resEmpty.intent).toBe('ambiguous');
      expect(resEmpty.keywords).toEqual([]);
    });
  });
});
