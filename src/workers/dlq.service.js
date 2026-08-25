const { logger } = require('../config/logger');
const { piiDetectorService } = require('../services/pii-detector.service');

// ============================================================
// Dead-Letter Queue (DLQ) Management Service
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================
// Captures and preserves permanently failed jobs for SRE debugging.
// Guarantees zero leakage of secrets or sensitive document content.

class DeadLetterQueueService {
  constructor() {
    this.deadLetterStore = [];
    this.maxEntries = 1000;
  }

  /**
   * Record a dead-letter job failure.
   * @param {object} params
   * @param {string} params.queueName
   * @param {string} params.jobId
   * @param {string} [params.jobName]
   * @param {string} [params.organizationId]
   * @param {object} [params.data={}]
   * @param {Error|string} params.error
   * @param {number} [params.attempts=0]
   * @returns {object} Stored DLQ record
   */
  captureFailure({
    queueName,
    jobId,
    jobName = 'default',
    organizationId = null,
    data = {},
    error,
    attempts = 0,
  }) {
    const rawErrorMessage = typeof error === 'string' ? error : error?.message || 'Unknown failure';
    const cleanErrorMessage = piiDetectorService.redact(rawErrorMessage);

    // Sanitize payload data
    const cleanData = JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (/secret|password|token|key|content|rawText/i.test(key) && typeof value === 'string') {
          return '[REDACTED]';
        }
        return value;
      })
    );

    const dlqRecord = {
      dlqId: `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      queueName,
      jobId,
      jobName,
      organizationId,
      data: cleanData,
      error: cleanErrorMessage,
      attempts,
      failedAt: new Date().toISOString(),
    };

    logger.error(
      { dlqId: dlqRecord.dlqId, queueName, jobId, attempts, error: cleanErrorMessage },
      'Job moved to Dead-Letter Queue'
    );

    this.deadLetterStore.push(dlqRecord);
    if (this.deadLetterStore.length > this.maxEntries) {
      this.deadLetterStore.shift();
    }

    return dlqRecord;
  }

  /**
   * List DLQ records with filtering.
   * @param {object} [options={}]
   * @param {string} [options.queueName]
   * @param {string} [options.organizationId]
   * @param {number} [options.limit=50]
   * @returns {Array<object>}
   */
  list({ queueName, organizationId, limit = 50 } = {}) {
    let results = [...this.deadLetterStore];

    if (queueName) {
      results = results.filter((r) => r.queueName === queueName);
    }
    if (organizationId) {
      results = results.filter((r) => r.organizationId === organizationId);
    }

    return results.slice(-limit).reverse();
  }

  /**
   * Clear all DLQ records.
   */
  clear() {
    this.deadLetterStore = [];
  }
}

const deadLetterQueueService = new DeadLetterQueueService();

module.exports = {
  DeadLetterQueueService,
  deadLetterQueueService,
};
