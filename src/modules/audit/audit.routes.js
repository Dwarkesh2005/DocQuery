const { Router } = require('express');
const auditController = require('./audit.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { queryAuditLogsSchema } = require('./audit.schema');

// ============================================================
// Audit Routes
// ============================================================

const router = Router();

// Requires authentication, organization resolution, and OWNER/ADMIN role
router.use(authenticate, resolveOrganization, requireRole('OWNER', 'ADMIN'));

// GET /api/v1/audit-logs
router.get('/', validate(queryAuditLogsSchema), auditController.list);

module.exports = router;
