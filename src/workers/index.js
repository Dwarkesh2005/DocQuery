const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const { QUEUE_NAMES, QUEUE_PREFIX } = require('../config/queue.config');
const { logger } = require('../config/logger');

// ============================================================
// BullMQ Workers — Reliable Background Processing
// ============================================================
// Background job processors with at-least-once delivery, exponential
// retry backoffs, and idempotent transaction-safe handlers.

const workers = [];

// ── Audit Event Worker ──
function createAuditWorker() {
  const worker = new Worker(
    QUEUE_NAMES.AUDIT,
    async (job) => {
      logger.info({
        jobId: job.id,
        action: job.data.action,
        userId: job.data.userId,
        organizationId: job.data.organizationId,
      }, 'Processing audit event');

      // Simulate audit log storage (idempotent: upsert by job ID)
      await new Promise((resolve) => setTimeout(resolve, 50));

      logger.info({ jobId: job.id }, 'Audit event processed');
      return { processed: true, timestamp: new Date().toISOString() };
    },
    {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 1000,
      },
    },
  );

  const { deadLetterQueueService } = require('./dlq.service');

  worker.on('failed', (job, error) => {
    logger.error({
      jobId: job?.id,
      action: job?.data?.action,
      userId: job?.data?.userId,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: error.message,
    }, 'Audit job failed');

    if (job && job.attemptsMade >= (job.opts?.attempts || 1)) {
      deadLetterQueueService.captureFailure({
        queueName: QUEUE_NAMES.AUDIT,
        jobId: job.id,
        jobName: job.name,
        organizationId: job.data?.organizationId,
        data: job.data,
        error: error.message,
        attempts: job.attemptsMade,
      });
    }
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Audit job completed');
  });

  workers.push(worker);
  return worker;
}

// ── Notification Worker ──
function createNotificationWorker() {
  const worker = new Worker(
    QUEUE_NAMES.NOTIFICATION,
    async (job) => {
      logger.info({
        jobId: job.id,
        type: job.data.type,
        userId: job.data.userId,
      }, 'Processing notification');

      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.info({ jobId: job.id }, 'Notification sent');
      return { sent: true, timestamp: new Date().toISOString() };
    },
    {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({
      jobId: job?.id,
      type: job?.data?.type,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: error.message,
    }, 'Notification job failed');
  });

  workers.push(worker);
  return worker;
}

const { documentProcessingService } = require('../modules/documents/services/document-processing.service');

// ── Document Processing Worker ──
function createDocumentWorker() {
  const worker = new Worker(
    QUEUE_NAMES.DOCUMENT,
    async (job) => {
      logger.info({
        jobId: job.id,
        action: job.data.action,
        documentId: job.data.documentId,
        organizationId: job.data.organizationId,
        attempt: job.attemptsMade,
      }, 'Processing document job');

      const result = await documentProcessingService.processDocument(
        job.data.documentId,
        job.data.organizationId
      );

      logger.info({
        jobId: job.id,
        documentId: job.data.documentId,
        chunkCount: result.chunkCount,
      }, 'Document job processed successfully');

      return result;
    },
    {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({
      jobId: job?.id,
      documentId: job?.data?.documentId,
      organizationId: job?.data?.organizationId,
      action: job?.data?.action,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: error.message,
    }, 'Document job failed');

    if (job && job.attemptsMade >= (job.opts?.attempts || 1)) {
      deadLetterQueueService.captureFailure({
        queueName: QUEUE_NAMES.DOCUMENT,
        jobId: job.id,
        jobName: job.name,
        organizationId: job.data?.organizationId,
        data: { documentId: job.data?.documentId },
        error: error.message,
        attempts: job.attemptsMade,
      });
    }
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, documentId: job.data?.documentId }, 'Document job completed');
  });

  workers.push(worker);
  return worker;
}

const { createEvaluationWorker } = require('./evaluation.worker');

/**
 * Start all background workers.
 */
function startWorkers() {
  createAuditWorker();
  createNotificationWorker();
  createDocumentWorker();
  createEvaluationWorker();
  logger.info(`Started ${workers.length} BullMQ workers`);
}

/**
 * Close all workers gracefully with timeout.
 * @param {number} [timeoutMs=5000]
 */
async function closeWorkers(timeoutMs = 5000) {
  if (workers.length === 0) return;

  const closePromises = workers.map(async (worker) => {
    try {
      await worker.pause(true);
      await Promise.race([
        worker.close(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch (err) {
      logger.warn({ error: err.message }, 'Error closing worker');
    }
  });

  await Promise.all(closePromises);
  workers.length = 0;
  logger.info('All BullMQ workers closed gracefully');
}

module.exports = {
  startWorkers,
  closeWorkers,
  createAuditWorker,
  createNotificationWorker,
  createDocumentWorker,
  createEvaluationWorker,
  workers,
};


