const { Router } = require('express');
const apiKeyController = require('./api-key.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createApiKeySchema,
  apiKeyIdParamSchema,
  rotateApiKeySchema,
} = require('./api-key.schema');

// ============================================================
// API Key Routes
// ============================================================

const router = Router();

// All API key endpoints require user authentication, organization resolution, and OWNER/ADMIN role
router.use(authenticate, resolveOrganization, requireRole('OWNER', 'ADMIN'));

// POST /api/v1/api-keys (Create API key)
router.post('/', validate(createApiKeySchema), apiKeyController.create);

// GET /api/v1/api-keys (List API keys)
router.get('/', apiKeyController.list);

// DELETE /api/v1/api-keys/:id (Revoke API key)
router.delete('/:id', validate(apiKeyIdParamSchema), apiKeyController.revoke);

// POST /api/v1/api-keys/:id/rotate (Rotate API key)
router.post('/:id/rotate', validate(rotateApiKeySchema), apiKeyController.rotate);

module.exports = router;
