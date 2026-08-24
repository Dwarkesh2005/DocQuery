const { QueryRewritingService } = require('../src/modules/query/services/query-rewriting.service');

describe('Phase 8.2 — Query Rewriting Service', () => {
  let service;

  beforeEach(() => {
    service = new QueryRewritingService();
  });

  it('should rewrite conversational follow-up queries using previous conversation turns', async () => {
    const history = [
      { role: 'USER', content: 'What is the company vacation policy?' },
      { role: 'ASSISTANT', content: 'Full-time employees receive 20 days paid leave.' },
    ];

    const result = await service.rewriteQuery({
      query: 'What about enterprise contractors?',
      conversationHistory: history,
      enabled: true,
    });

    expect(result.wasRewritten).toBe(true);
    expect(result.originalQuery).toBe('What about enterprise contractors?');
    expect(result.rewrittenQuery).toContain('company vacation policy');
    expect(result.rewrittenQuery).toContain('enterprise contractors');
    expect(result.reason).toBe('CONVERSATIONAL_CONTEXT_RESOLVED');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should resolve pronoun references from prior user context', async () => {
    const history = [
      { role: 'USER', content: 'Where is the annual cybersecurity training module?' },
      { role: 'ASSISTANT', content: 'It is hosted on the internal portal.' },
    ];

    const result = await service.rewriteQuery({
      query: 'When is it due?',
      conversationHistory: history,
      enabled: true,
    });

    expect(result.wasRewritten).toBe(true);
    expect(result.rewrittenQuery.toLowerCase()).toContain('cybersecurity training module');
  });

  it('should not rewrite standalone queries that already contain full context', async () => {
    const history = [
      { role: 'USER', content: 'What is the refund policy?' },
      { role: 'ASSISTANT', content: 'Refunds are given within 30 days.' },
    ];

    const result = await service.rewriteQuery({
      query: 'How do I configure Single Sign-On with Okta?',
      conversationHistory: history,
      enabled: true,
    });

    expect(result.wasRewritten).toBe(false);
    expect(result.rewrittenQuery).toBe('How do I configure Single Sign-On with Okta?');
    expect(result.reason).toBe('QUERY_ALREADY_STANDALONE');
  });

  it('should return the original query when rewriting is explicitly disabled', async () => {
    const history = [{ role: 'USER', content: 'What is the policy?' }];
    const result = await service.rewriteQuery({
      query: 'What about contractors?',
      conversationHistory: history,
      enabled: false,
    });

    expect(result.wasRewritten).toBe(false);
    expect(result.rewrittenQuery).toBe('What about contractors?');
    expect(result.reason).toBe('REWRITE_DISABLED');
  });

  it('should safely fall back to original query on any parsing or runtime error', async () => {
    const mockUnderstanding = {
      analyze: jest.fn().mockRejectedValue(new Error('Internal analysis failure')),
    };
    const errorService = new QueryRewritingService({ understandingService: mockUnderstanding });

    const result = await errorService.rewriteQuery({
      query: 'Tell me more',
      conversationHistory: [{ role: 'USER', content: 'Topic A' }],
      enabled: true,
    });

    expect(result.wasRewritten).toBe(false);
    expect(result.rewrittenQuery).toBe('Tell me more');
    expect(result.reason).toBe('REWRITE_ERROR_FALLBACK');
  });
});
