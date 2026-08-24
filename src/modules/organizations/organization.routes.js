const { Router } = require('express');
const organizationController = require('./organization.controller');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { createOrganizationSchema, organizationIdParamSchema } = require('./organization.schema');

const router = Router();

// ============================================================
// Organization Routes — /api/v1/organizations
// ============================================================
// All routes require authentication.

router.use(authenticate);

router.post('/', validate(createOrganizationSchema), organizationController.create);
router.get('/', organizationController.list);
router.get('/:id', validate(organizationIdParamSchema), organizationController.getById);
router.get('/:id/quota', validate(organizationIdParamSchema), organizationController.getQuota);
router.get('/:id/usage', validate(organizationIdParamSchema), organizationController.getUsage);

module.exports = router;
