const { Queue } = require('bullmq');
const { getRedisClient, isRedisReady } = require('./redis');

// ============================================================
// BullMQ Queue Configuration
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

let auditQueue = null;
let notificationQueue = null;
let documentQueue = null;
let evaluationQueue = null;
let intelligenceQueue = null;
let entityQueue = null;

const QUEUE_PREFIX = 'docquery';

const QUEUE_NAMES = {
  AUDIT: 'audit',
  NOTIFICATION: 'notification',
  DOCUMENT: 'document',
  EVALUATION: 'evaluation',
  DOCUMENT_INTELLIGENCE: 'document-intelligence',
  ENTITY_EXTRACTION: 'entity-extraction',
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s base → 2s → 4s → 8s → 16s
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

function getAuditQueue() {
  if (!isRedisReady()) return null;
  if (!auditQueue) {
    auditQueue = new Queue(QUEUE_NAMES.AUDIT, {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return auditQueue;
}

function getNotificationQueue() {
  if (!isRedisReady()) return null;
  if (!notificationQueue) {
    notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return notificationQueue;
}

function getDocumentQueue() {
  if (!isRedisReady()) return null;
  if (!documentQueue) {
    documentQueue = new Queue(QUEUE_NAMES.DOCUMENT, {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 3,
      },
    });
  }
  return documentQueue;
}

function getEvaluationQueue() {
  if (!isRedisReady()) return null;
  if (!evaluationQueue) {
    evaluationQueue = new Queue(QUEUE_NAMES.EVALUATION, {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 2,
      },
    });
  }
  return evaluationQueue;
}

function getIntelligenceQueue() {
  if (!isRedisReady()) return null;
  if (!intelligenceQueue) {
    intelligenceQueue = new Queue(QUEUE_NAMES.DOCUMENT_INTELLIGENCE, {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return intelligenceQueue;
}

function getEntityQueue() {
  if (!isRedisReady()) return null;
  if (!entityQueue) {
    entityQueue = new Queue(QUEUE_NAMES.ENTITY_EXTRACTION, {
      connection: getRedisClient(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return entityQueue;
}

async function closeQueues() {
  const queues = [
    auditQueue,
    notificationQueue,
    documentQueue,
    evaluationQueue,
    intelligenceQueue,
    entityQueue,
  ].filter(Boolean);
  await Promise.all(queues.map((q) => q.close()));
  auditQueue = null;
  notificationQueue = null;
  documentQueue = null;
  evaluationQueue = null;
  intelligenceQueue = null;
  entityQueue = null;
}

module.exports = {
  QUEUE_PREFIX,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  getAuditQueue,
  getNotificationQueue,
  getDocumentQueue,
  getEvaluationQueue,
  getIntelligenceQueue,
  getEntityQueue,
  closeQueues,
};
