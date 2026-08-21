const {
  isTransientError,
  getBackoffDelay,
  ExternalServiceError,
} = require('../src/utils/http-client');

describe('Resilience & HTTP Client Utility', () => {
  describe('isTransientError', () => {
    it('should classify timeout and connection errors as transient', () => {
      expect(isTransientError({ name: 'AbortError' })).toBe(true);
      expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
      expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isTransientError({ statusCode: 503 })).toBe(true);
      expect(isTransientError({ statusCode: 429 })).toBe(true);
    });

    it('should classify 400, 401, 403, 404 as non-transient (permanent)', () => {
      expect(isTransientError({ statusCode: 400 })).toBe(false);
      expect(isTransientError({ statusCode: 401 })).toBe(false);
      expect(isTransientError({ statusCode: 403 })).toBe(false);
      expect(isTransientError({ statusCode: 404 })).toBe(false);
    });
  });

  describe('getBackoffDelay', () => {
    it('should calculate exponential delay within bounds', () => {
      const delay0 = getBackoffDelay(0, 100, 5000);
      expect(delay0).toBeGreaterThanOrEqual(100);
      expect(delay0).toBeLessThanOrEqual(5000);

      const delay3 = getBackoffDelay(3, 100, 5000);
      expect(delay3).toBeGreaterThanOrEqual(800);
    });
  });

  describe('ExternalServiceError', () => {
    it('should carry service name and transient classification', () => {
      const err = new ExternalServiceError('Upstream down', 503, 'DocumentAI', true);
      expect(err.statusCode).toBe(503);
      expect(err.service).toBe('DocumentAI');
      expect(err.isTransient).toBe(true);
    });
  });
});
