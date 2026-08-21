const { Queue } = require('bullmq');
const { getRedisClient, isRedisReady } = require('./redis');

// ============================================================
// BullMQ Queue Configuration
// ============================================================
// Defines the application's job queues. Each queue handles a
// specific category of background work. All queues share the
// singleton Redis connection.
//
// Queues:
//   - audit: Audit log events (member changes, org changes)
//   - notification: Email / notification processing
//   - document: Document processing & AI analysis (future)

let auditQueue = null;
let notificationQueue = null;
let documentQueue = null;

const QUEUE_NAMES = {
  AUDIT: 'docquery:audit',
  NOTIFICATION: 'docquery:notification',
  DOCUMENT: 'docquery:document',
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s base → 2s → 4s → 8s → 16s
  },
  removeOnComplete: { count: 1000 },    // Keep last 1000 completed
  removeOnFail: { count: 5000 },         // Keep last 5000 failed for debugging
};

/**
 * Get or create the audit queue.
 */
function getAuditQueue() {
  if (!isRedisReady()) return null;
  if (!auditQueue) {
    auditQueue = new Queue(QUEUE_NAMES.AUDIT, {
      connection: getRedisClient(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return auditQueue;
}

/**
 * Get or create the notification queue.
 */
function getNotificationQueue() {
  if (!isRedisReady()) return null;
  if (!notificationQueue) {
    notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
      connection: getRedisClient(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return notificationQueue;
}

/**
 * Get or create the document queue.
 */
function getDocumentQueue() {
  if (!isRedisReady()) return null;
  if (!documentQueue) {
    documentQueue = new Queue(QUEUE_NAMES.DOCUMENT, {
      connection: getRedisClient(),
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 3,
      },
    });
  }
  return documentQueue;
}

/**
 * Close all queues gracefully.
 */
async function closeQueues() {
  const queues = [auditQueue, notificationQueue, documentQueue].filter(Boolean);
  await Promise.all(queues.map((q) => q.close()));
  auditQueue = null;
  notificationQueue = null;
  documentQueue = null;
}

module.exports = {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  getAuditQueue,
  getNotificationQueue,
  getDocumentQueue,
  closeQueues,
};
