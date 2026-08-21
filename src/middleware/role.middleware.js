const { ForbiddenError } = require('../utils/errors');

// ============================================================
// Role-Based Access Control Middleware
// ============================================================
// Reusable middleware factory that checks the authenticated
// user's role in the resolved organization against a list
// of permitted roles.
//
// MUST be used AFTER authenticate + resolveOrganization.
//
// Usage:
//   requireRole('OWNER')
//   requireRole('OWNER', 'ADMIN')
//   requireRole('OWNER', 'ADMIN', 'MEMBER')

/**
 * Create RBAC middleware that permits the given roles.
 * @param  {...string} allowedRoles — OrganizationRole values
 * @returns {import('express').RequestHandler}
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    try {
      // Defensive: ensure middleware chain is correct
      if (!req.membership) {
        throw new ForbiddenError(
          'Organization context required for role check',
          'ORG_CONTEXT_REQUIRED',
        );
      }

      const userRole = req.membership.role;

      if (!allowedRoles.includes(userRole)) {
        throw new ForbiddenError(
          'You do not have the required role to perform this action',
          'ROLE_INSUFFICIENT',
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireRole };
