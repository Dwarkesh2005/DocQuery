const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const { QUEUE_NAMES } = require('../config/queue.config');
const { logger } = require('../config/logger');

// ============================================================
// BullMQ Workers
// ============================================================
// Background job processors. Each worker handles jobs from a
// specific queue. Workers run in the same process for
// simplicity, but can be split into separate processes for
// horizontal scaling.
//
// Trade-offs:
//   At-most-once:  Job may be lost if worker crashes mid-process
//   At-least-once: Job may be processed twice on crash recovery ← WE USE THIS
//   Exactly-once:  Requires external transaction coordination
//
// We use at-least-once with idempotent job handlers to safely
// handle re-processing after crashes.

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
      // In production, this would write to an audit log table or
      // forward to an external analytics/SIEM system
      await new Promise((resolve) => setTimeout(resolve, 50));

      logger.info({ jobId: job.id }, 'Audit event processed');
      return { processed: true, timestamp: new Date().toISOString() };
    },
    {
      connection: getRedisClient(),
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 1000, // 50 jobs per second max
      },
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({
      jobId: job?.id,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      error: error.message,
    }, 'Audit job failed');
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

      // Simulate sending notification (email, push, etc.)
      // In production: call SendGrid, AWS SES, Firebase, etc.
      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.info({ jobId: job.id }, 'Notification sent');
      return { sent: true, timestamp: new Date().toISOString() };
    },
    {
      connection: getRedisClient(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({
      jobId: job?.id,
      type: job?.data?.type,
      attempt: job?.attemptsMade,
      error: error.message,
    }, 'Notification job failed');
  });

  workers.push(worker);
  return worker;
}

// ── Document Processing Worker ──
function createDocumentWorker() {
  const worker = new Worker(
    QUEUE_NAMES.DOCUMENT,
    async (job) => {
      logger.info({
        jobId: job.id,
        action: job.data.action,
        documentId: job.data.documentId,
      }, 'Processing document job');

      // Simulate document processing (OCR, embedding, summarization)
      // In production: call OpenAI API, run local ML model, etc.
      await new Promise((resolve) => setTimeout(resolve, 200));

      logger.info({ jobId: job.id }, 'Document job processed');
      return { processed: true, timestamp: new Date().toISOString() };
    },
    {
      connection: getRedisClient(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({
      jobId: job?.id,
      action: job?.data?.action,
      attempt: job?.attemptsMade,
      error: error.message,
    }, 'Document job failed');
  });

  workers.push(worker);
  return worker;
}

/**
 * Start all workers.
 */
function startWorkers() {
  createAuditWorker();
  createNotificationWorker();
  createDocumentWorker();
  logger.info(`Started ${workers.length} BullMQ workers`);
}

/**
 * Close all workers gracefully.
 */
async function closeWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}

module.exports = { startWorkers, closeWorkers };
