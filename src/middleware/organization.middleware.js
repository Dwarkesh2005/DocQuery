const { BadRequestError, ForbiddenError } = require('../utils/errors');
const { prisma } = require('../config/database');

// ============================================================
// Organization Resolution Middleware
// ============================================================
// Reads X-Organization-Id header, verifies the authenticated
// user's membership in that organization, and attaches both
// the organization and membership to the request.
//
// MUST be used AFTER authenticate middleware.
//
// Request flow:
//   req.user → X-Organization-Id → Membership Verification
//   → req.organization + req.membership

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function resolveOrganization(req, _res, next) {
  try {
    // 1. Require authentication (defensive check)
    if (!req.user) {
      throw new ForbiddenError('Authentication required before organization resolution', 'AUTH_REQUIRED');
    }

    // 2. Read organization ID from header
    const organizationId = req.headers['x-organization-id'];

    if (!organizationId || typeof organizationId !== 'string') {
      throw new BadRequestError(
        'X-Organization-Id header is required',
        'ORG_HEADER_REQUIRED',
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(organizationId)) {
      throw new BadRequestError(
        'Invalid organization ID format',
        'ORG_INVALID_ID',
      );
    }

    // 3. Find the user's membership in this organization
    // This query simultaneously verifies:
    //   - The organization exists
    //   - The user is a member of it
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      // Intentionally vague — don't reveal whether org exists
      throw new ForbiddenError(
        'You do not have access to this organization',
        'ORG_ACCESS_DENIED',
      );
    }

    // 4. Attach to request
    req.organization = membership.organization;
    req.membership = membership;

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { resolveOrganization };
