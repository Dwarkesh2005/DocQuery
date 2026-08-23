const { Router } = require('express');
const queryController = require('./query.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { queryRequestSchema } = require('./query.schema');

// ============================================================
// Query Routes
// ============================================================

const router = Router();

// All query endpoints require authentication and active tenant resolution
router.use(authenticate, resolveOrganization);

// POST /api/v1/query
router.post('/', validate(queryRequestSchema), queryController.query);

module.exports = router;
