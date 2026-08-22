const { Router } = require('express');
const searchController = require('./search.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { searchRequestSchema } = require('./search.schema');

// ============================================================
// Search Routes
// ============================================================

const router = Router();

// All search endpoints require authentication and active tenant resolution
router.use(authenticate, resolveOrganization);

// POST /api/v1/search
router.post('/', validate(searchRequestSchema), searchController.search);

module.exports = router;
