const { getAuditQueue, getNotificationQueue, getDocumentQueue } = require('../config/queue.config');
const { logger } = require('../config/logger');

// ============================================================
// Queue Service — Job Producer
// ============================================================
// Centralized job creation. Controllers and services call
// these functions to enqueue background work. Each function
// adds an idempotency-safe job ID to prevent duplicate
// processing when possible.
//
// Note: BullMQ custom job IDs MUST NOT contain colons (:).
// Dashes (-) or underscores (_) are used as delimiters.

/**
 * Enqueue an audit log event.
 * @param {object} data
 * @param {string} data.action   - e.g. 'member.added', 'org.created'
 * @param {string} data.userId   - User who performed the action
 * @param {string} [data.organizationId]
 * @param {object} [data.details] - Additional context
 * @returns {Promise<string|null>} - Job ID or null if queue unavailable
 */
async function enqueueAuditEvent(data) {
  const queue = getAuditQueue();
  if (!queue) {
    logger.debug({ data }, 'Audit queue unavailable, skipping audit event');
    return null;
  }

  try {
    const actionKey = (data.action || 'event').replace(/[^a-zA-Z0-9_-]/g, '_');
    const orgKey = (data.organizationId || 'none').replace(/[^a-zA-Z0-9_-]/g, '_');
    const timeBucket = Math.floor(Date.now() / 300000);

    const job = await queue.add('audit.event', {
      ...data,
      timestamp: new Date().toISOString(),
    }, {
      // Idempotency: same action+user+org within 5 minutes deduplicates
      jobId: `audit_${actionKey}_${data.userId}_${orgKey}_${timeBucket}`,
    });
    logger.debug({ jobId: job.id, action: data.action }, 'Audit event enqueued');
    return job.id;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to enqueue audit event');
    return null;
  }
}

/**
 * Enqueue a notification (email, push, etc.).
 * @param {object} data
 * @param {string} data.type    - e.g. 'member.invited', 'welcome'
 * @param {string} data.userId  - Target user
 * @param {object} [data.payload]
 * @returns {Promise<string|null>}
 */
async function enqueueNotification(data) {
  const queue = getNotificationQueue();
  if (!queue) {
    logger.debug({ data }, 'Notification queue unavailable, skipping notification');
    return null;
  }

  try {
    const job = await queue.add('notification.send', {
      ...data,
      timestamp: new Date().toISOString(),
    });
    logger.debug({ jobId: job.id, type: data.type }, 'Notification enqueued');
    return job.id;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to enqueue notification');
    return null;
  }
}

/**
 * Enqueue a document processing job.
 * @param {object} data
 * @param {string} data.documentId
 * @param {string} data.organizationId
 * @param {string} data.action - e.g. 'extract', 'embed', 'summarize'
 * @returns {Promise<string|null>}
 */
async function enqueueDocumentJob(data) {
  const queue = getDocumentQueue();
  if (!queue) {
    logger.debug({ data }, 'Document queue unavailable, skipping document job');
    return null;
  }

  try {
    const actionKey = (data.action || 'task').replace(/[^a-zA-Z0-9_-]/g, '_');
    const docKey = (data.documentId || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_');

    const job = await queue.add(`document.${data.action}`, {
      ...data,
      timestamp: new Date().toISOString(),
    }, {
      // Idempotency: same document + action deduplicates
      jobId: `doc_${actionKey}_${docKey}`,
    });
    logger.debug({ jobId: job.id, action: data.action }, 'Document job enqueued');
    return job.id;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to enqueue document job');
    return null;
  }
}

module.exports = {
  enqueueAuditEvent,
  enqueueNotification,
  enqueueDocumentJob,
};
