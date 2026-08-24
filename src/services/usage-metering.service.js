const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

// ============================================================
// Usage Metering Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Event-driven usage tracking and daily aggregation.

class UsageMeteringService {
  /**
   * Record a usage event and update daily aggregate.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} [params.userId]
   * @param {string} params.eventType - 'QUERY' | 'EMBEDDING' | 'STORAGE' | 'API_REQUEST' | 'LLM_TOKENS' | 'DOCUMENT_UPLOAD'
   * @param {number} [params.quantity=1]
   * @param {string} [params.units='COUNT'] - 'COUNT' | 'TOKENS' | 'BYTES'
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async recordUsage({
    organizationId,
    userId = null,
    eventType,
    quantity = 1,
    units = 'COUNT',
    metadata = {},
  }) {
    try {
      const record = await prisma.usageRecord.create({
        data: {
          organizationId,
          userId,
          eventType,
          quantity,
          units,
          metadata,
        },
      });

      // Update daily aggregate
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      await this._updateDailyAggregate(organizationId, today, eventType, quantity, metadata).catch((err) => {
        logger.warn({ error: err.message, organizationId }, 'Daily aggregate update non-fatal error');
      });

      return record;
    } catch (error) {
      logger.error({ error: error.message, organizationId, eventType }, 'Failed to record usage record');
      return null;
    }
  }

  /**
   * Internal roll-up helper for daily aggregates.
   */
  async _updateDailyAggregate(organizationId, date, eventType, quantity, metadata) {
    const updateData = {};

    if (eventType === 'QUERY') {
      updateData.queriesCount = { increment: quantity };
    } else if (eventType === 'API_REQUEST') {
      updateData.apiRequests = { increment: quantity };
    } else if (eventType === 'EMBEDDING') {
      updateData.embeddingsCount = { increment: quantity };
    } else if (eventType === 'LLM_TOKENS') {
      if (metadata?.inputTokens) updateData.inputTokens = { increment: metadata.inputTokens };
      if (metadata?.outputTokens) updateData.outputTokens = { increment: metadata.outputTokens };
    } else if (eventType === 'STORAGE') {
      updateData.storageBytes = { increment: BigInt(quantity) };
    }

    await prisma.usageDailyAggregate.upsert({
      where: {
        organizationId_date: {
          organizationId,
          date,
        },
      },
      create: {
        organizationId,
        date,
        queriesCount: eventType === 'QUERY' ? quantity : 0,
        apiRequests: eventType === 'API_REQUEST' ? quantity : 0,
        embeddingsCount: eventType === 'EMBEDDING' ? quantity : 0,
        inputTokens: metadata?.inputTokens || 0,
        outputTokens: metadata?.outputTokens || 0,
        storageBytes: eventType === 'STORAGE' ? BigInt(quantity) : BigInt(0),
      },
      update: updateData,
    });
  }

  /**
   * Get total current monthly usage for an organization.
   * @param {string} organizationId
   * @returns {Promise<object>}
   */
  async getCurrentMonthlyUsage(organizationId) {
    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    const aggregates = await prisma.usageDailyAggregate.findMany({
      where: {
        organizationId,
        date: { startsWith: currentMonthPrefix },
      },
    });

    let totalQueries = 0;
    let totalTokens = 0;
    let totalApiRequests = 0;
    let totalEmbeddings = 0;
    let totalStorageBytes = BigInt(0);

    for (const agg of aggregates) {
      totalQueries += agg.queriesCount;
      totalTokens += agg.inputTokens + agg.outputTokens;
      totalApiRequests += agg.apiRequests;
      totalEmbeddings += agg.embeddingsCount;
      if (agg.storageBytes > totalStorageBytes) {
        totalStorageBytes = agg.storageBytes;
      }
    }

    // Also count total current active documents
    const totalDocuments = await prisma.document.count({
      where: { organizationId, status: { not: 'FAILED' } },
    });

    return {
      month: currentMonthPrefix,
      totalQueries,
      totalTokens,
      totalApiRequests,
      totalEmbeddings,
      totalDocuments,
      totalStorageBytes: Number(totalStorageBytes),
    };
  }
}

const usageMeteringService = new UsageMeteringService();

module.exports = {
  UsageMeteringService,
  usageMeteringService,
};
