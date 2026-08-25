const { logger } = require('../config/logger');
const { piiDetectorService } = require('./pii-detector.service');

// ============================================================
// Centralized Error Tracking Service
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================
// Sanitizes and logs errors with trace context, redaction of secrets
// and sensitive PII, and structural metadata.

class ErrorTrackerService {
  constructor() {
    this.errorLog = [];
    this.maxMemoryEntries = 500;
  }

  /**
   * Track and sanitize an operational error.
   * @param {Error} error
   * @param {object} [context={}]
   * @returns {object} Sanitized error entry
   */
  captureError(error, context = {}) {
    const rawMessage = error?.message || 'Unknown error';
    const cleanMessage = piiDetectorService.redact(rawMessage);

    // Redact sensitive keys from context
    const cleanContext = JSON.parse(
      JSON.stringify(context, (key, value) => {
        if (/secret|token|password|key|authorization/i.test(key) && typeof value === 'string') {
          return '[REDACTED]';
        }
        return value;
      })
    );

    const errorEntry = {
      timestamp: new Date().toISOString(),
      name: error?.name || 'Error',
      code: error?.code || 'INTERNAL_ERROR',
      message: cleanMessage,
      statusCode: error?.statusCode || 500,
      requestId: cleanContext.requestId || null,
      traceId: cleanContext.traceId || null,
      organizationId: cleanContext.organizationId || null,
      userId: cleanContext.userId || null,
      route: cleanContext.route || null,
      method: cleanContext.method || null,
    };

    logger.error(errorEntry, 'Captured operational error');

    // Keep bounded in-memory buffer for diagnostics
    this.errorLog.push(errorEntry);
    if (this.errorLog.length > this.maxMemoryEntries) {
      this.errorLog.shift();
    }

    return errorEntry;
  }

  /**
   * Get recent error history for SRE inspection.
   * @param {number} [limit=50]
   * @returns {Array<object>}
   */
  getRecentErrors(limit = 50) {
    return this.errorLog.slice(-limit);
  }

  /**
   * Clear error buffer.
   */
  clear() {
    this.errorLog = [];
  }
}

const errorTrackerService = new ErrorTrackerService();

module.exports = {
  ErrorTrackerService,
  errorTrackerService,
};
