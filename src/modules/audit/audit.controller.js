const { auditService } = require('../../services/audit.service');

// ============================================================
// Audit Controller
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

/**
 * GET /api/v1/audit-logs
 * List immutable audit trail logs with filtering.
 */
async function list(req, res, next) {
  try {
    const {
      action,
      userId,
      resourceType,
      resourceId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = req.query;

    const skip = (page - 1) * limit;

    const { logs, total } = await auditService.queryLogs({
      organizationId: req.organization.id,
      action,
      userId,
      resourceType,
      resourceId,
      dateFrom,
      dateTo,
      skip,
      take: limit,
    });

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
};
