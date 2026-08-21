const { Router } = require('express');
const memberController = require('./member.controller');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const {
  addMemberSchema,
  updateMemberRoleSchema,
  memberParamsSchema,
  listMembersParamsSchema,
} = require('./member.schema');

const router = Router({ mergeParams: true });

// ============================================================
// Member Routes — /api/v1/organizations/:id/members
// ============================================================
// All routes require: authenticate → resolveOrganization
// Write operations additionally require OWNER or ADMIN role.

router.use(authenticate, resolveOrganization);

// Any member can list members
router.get(
  '/',
  validate(listMembersParamsSchema),
  memberController.listMembers,
);

// OWNER and ADMIN can manage members
router.post(
  '/',
  requireRole('OWNER', 'ADMIN'),
  validate(addMemberSchema),
  memberController.addMember,
);

router.patch(
  '/:userId',
  requireRole('OWNER', 'ADMIN'),
  validate(updateMemberRoleSchema),
  memberController.updateMemberRole,
);

router.delete(
  '/:userId',
  requireRole('OWNER', 'ADMIN'),
  validate(memberParamsSchema),
  memberController.removeMember,
);

module.exports = router;
