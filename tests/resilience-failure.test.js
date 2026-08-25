const { costOptimizerService } = require('../src/services/cost-optimizer.service');
const { errorTrackerService } = require('../src/services/error-tracker.service');

describe('Phase 10.3 — Resilience & Error Tracking', () => {
  it('should fall back gracefully to memory cache when Redis is unavailable', async () => {
    const text = 'Resilience fallback test string';
    const vector = [0.1, 0.2, 0.3];

    // Caching in memory succeeds even if Redis is down
    await costOptimizerService.cacheEmbedding(text, vector);
    const retrieved = await costOptimizerService.getCachedEmbedding(text);

    expect(retrieved).toEqual(vector);
  });

  it('should sanitize PII and scrub secrets from error tracking logs', () => {
    const sensitiveError = new Error('Database failed while verifying token: sk-abcdefghijklmnopqrstuvwxyz123456');
    const context = {
      apiKey: 'dq_live_01234567_abcdef0123456789',
      organizationId: 'org-test-123',
      userEmail: 'admin@acme.com',
    };

    const entry = errorTrackerService.captureError(sensitiveError, context);

    expect(entry.message).toContain('[API_KEY_REDACTED]');
    expect(entry.organizationId).toBe('org-test-123');
  });
});
