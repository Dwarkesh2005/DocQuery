const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { piiDetectorService } = require('./pii-detector.service');

// ============================================================
// Audit Logging Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Records immutable audit trail records with automatic PII redaction.

class AuditService {
  /**
   * Record an immutable audit log entry.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} [params.userId]
   * @param {string} params.action - e.g. 'DOCUMENT_UPLOADED', 'API_KEY_CREATED'
   * @param {string} params.resourceType - e.g. 'DOCUMENT', 'API_KEY', 'ORGANIZATION'
   * @param {string} [params.resourceId]
   * @param {string} [params.requestId]
   * @param {string} [params.ipAddress]
   * @param {string} [params.userAgent]
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async log({
    organizationId,
    userId = null,
    action,
    resourceType,
    resourceId = null,
    requestId = null,
    ipAddress = null,
    userAgent = null,
    metadata = {},
  }) {
    try {
      // Redact potential secrets/PII from metadata before persistence
      const sanitizedMeta = metadata ? JSON.parse(piiDetectorService.redact(JSON.stringify(metadata))) : {};

      const entry = await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action,
          resourceType,
          resourceId,
          requestId,
          ipAddress,
          userAgent,
          metadata: sanitizedMeta,
        },
      });

      return entry;
    } catch (error) {
      logger.error({ error: error.message, organizationId, action }, 'Failed to record audit log entry');
      return null;
    }
  }

  /**
   * Query organization audit logs with filtering and pagination.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} [params.action]
   * @param {string} [params.userId]
   * @param {string} [params.resourceType]
   * @param {string} [params.resourceId]
   * @param {string} [params.dateFrom]
   * @param {string} [params.dateTo]
   * @param {number} [params.skip=0]
   * @param {number} [params.take=50]
   * @returns {Promise<{ logs: Array<object>, total: number }>}
   */
  async queryLogs({
    organizationId,
    action,
    userId,
    resourceType,
    resourceId,
    dateFrom,
    dateTo,
    skip = 0,
    take = 50,
  }) {
    const where = { organizationId };

    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (resourceType) where.resourceType = resourceType;
    if (resourceId) where.resourceId = resourceId;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }
}

const auditService = new AuditService();

module.exports = {
  AuditService,
  auditService,
};
