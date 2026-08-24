const { quotaService } = require('../services/quota.service');

// ============================================================
// Quota Enforcement Middleware
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

/**
 * Middleware factory to enforce quota constraints.
 * @param {'QUERIES' | 'DOCUMENTS' | 'API_REQUESTS' | 'STORAGE'} checkType
 * @returns {import('express').RequestHandler}
 */
function requireQuota(checkType) {
  return async (req, _res, next) => {
    try {
      if (req.organization?.id) {
        await quotaService.checkQuota(req.organization.id, checkType);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requireQuota,
};
