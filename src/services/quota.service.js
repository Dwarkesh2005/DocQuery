const { prisma } = require('../config/database');
const { usageMeteringService } = require('./usage-metering.service');

// ============================================================
// Quota & Tier Enforcement Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

const PLAN_DEFAULTS = {
  FREE: {
    maxDocuments: 100,
    maxStorageBytes: 524288000, // 500MB
    maxQueriesPerMonth: 1000,
    maxTokensPerMonth: 1000000,
    maxApiRequests: 10000,
    maxMembers: 5,
  },
  PRO: {
    maxDocuments: 1000,
    maxStorageBytes: 10737418240, // 10GB
    maxQueriesPerMonth: 10000,
    maxTokensPerMonth: 10000000,
    maxApiRequests: 100000,
    maxMembers: 20,
  },
  TEAM: {
    maxDocuments: 10000,
    maxStorageBytes: 107374182400, // 100GB
    maxQueriesPerMonth: 100000,
    maxTokensPerMonth: 100000000,
    maxApiRequests: 1000000,
    maxMembers: 100,
  },
  ENTERPRISE: {
    maxDocuments: 1000000,
    maxStorageBytes: 1099511627776, // 1TB
    maxQueriesPerMonth: 10000000,
    maxTokensPerMonth: 1000000000,
    maxApiRequests: 10000000,
    maxMembers: 10000,
  },
};

class QuotaExceededError extends Error {
  constructor(message, code = 'QUOTA_EXCEEDED') {
    super(message);
    this.name = 'QuotaExceededError';
    this.statusCode = 429;
    this.code = code;
  }
}

class QuotaService {
  /**
   * Get or create default quota record for an organization.
   * @param {string} organizationId
   * @param {string} [plan='FREE']
   * @returns {Promise<object>}
   */
  async getOrCreateQuota(organizationId, plan = 'FREE') {
    const existing = await prisma.organizationQuota.findUnique({
      where: { organizationId },
    });

    if (existing) return existing;

    const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.FREE;
    return prisma.organizationQuota.create({
      data: {
        organizationId,
        plan,
        maxDocuments: defaults.maxDocuments,
        maxStorageBytes: BigInt(defaults.maxStorageBytes),
        maxQueriesPerMonth: defaults.maxQueriesPerMonth,
        maxTokensPerMonth: defaults.maxTokensPerMonth,
        maxApiRequests: defaults.maxApiRequests,
        maxMembers: defaults.maxMembers,
      },
    });
  }

  /**
   * Check whether an organization has exceeded its quota for a specific operation.
   * @param {string} organizationId
   * @param {'QUERIES' | 'DOCUMENTS' | 'API_REQUESTS' | 'STORAGE'} checkType
   * @throws {QuotaExceededError} if limit is exceeded
   */
  async checkQuota(organizationId, checkType) {
    const quota = await this.getOrCreateQuota(organizationId);
    const usage = await usageMeteringService.getCurrentMonthlyUsage(organizationId);

    if (checkType === 'QUERIES') {
      if (usage.totalQueries >= quota.maxQueriesPerMonth) {
        throw new QuotaExceededError(
          `Monthly query limit reached (${usage.totalQueries}/${quota.maxQueriesPerMonth}). Please upgrade your plan.`,
          'QUERY_QUOTA_EXCEEDED'
        );
      }
    } else if (checkType === 'DOCUMENTS') {
      if (usage.totalDocuments >= quota.maxDocuments) {
        throw new QuotaExceededError(
          `Document storage count limit reached (${usage.totalDocuments}/${quota.maxDocuments}). Please upgrade your plan.`,
          'DOCUMENT_QUOTA_EXCEEDED'
        );
      }
    } else if (checkType === 'API_REQUESTS') {
      if (usage.totalApiRequests >= quota.maxApiRequests) {
        throw new QuotaExceededError(
          `Monthly API request limit reached (${usage.totalApiRequests}/${quota.maxApiRequests}).`,
          'API_REQUEST_QUOTA_EXCEEDED'
        );
      }
    }
  }
}

const quotaService = new QuotaService();

module.exports = {
  QuotaService,
  quotaService,
  QuotaExceededError,
  PLAN_DEFAULTS,
};
