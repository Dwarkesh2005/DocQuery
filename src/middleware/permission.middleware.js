const { ForbiddenError } = require('../utils/errors');
const { hasPermission } = require('../config/permissions.config');

// ============================================================
// Permission-Based Access Control Middleware
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

/**
 * Require at least one of the specified permissions.
 * @param {...string} requiredPermissions
 * @returns {import('express').RequestHandler}
 */
function requirePermission(...requiredPermissions) {
  return (req, _res, next) => {
    try {
      // 1. API Key Request
      if (req.apiKey) {
        const scopes = Array.isArray(req.apiKey.scopes) ? req.apiKey.scopes : [];
        const hasScope = requiredPermissions.some((p) => {
          if (scopes.includes('*') || scopes.includes('admin') || scopes.includes('all')) return true;
          if (scopes.includes(p)) return true;

          // Scope mapping format e.g. "DOCUMENT_READ" -> "documents:read", "document:read"
          const pLower = p.toLowerCase();
          const pColon = pLower.replace('_', ':');
          const [resource, action] = pColon.split(':');
          const pluralResource = resource.endsWith('s') ? resource : `${resource}s`;
          const singularResource = resource.endsWith('s') ? resource.slice(0, -1) : resource;

          return (
            scopes.includes(pColon) ||
            scopes.includes(`${pluralResource}:${action}`) ||
            scopes.includes(`${singularResource}:${action}`) ||
            scopes.includes(`${pluralResource}:*`) ||
            scopes.includes(`${singularResource}:*`)
          );
        });

        if (!hasScope) {
          throw new ForbiddenError(
            `API key lacks required permission: ${requiredPermissions.join(', ')}`,
            'API_KEY_SCOPE_INSUFFICIENT',
          );
        }
        return next();
      }

      // 2. User Membership Request
      if (!req.membership) {
        throw new ForbiddenError(
          'Organization context required for permission check',
          'ORG_CONTEXT_REQUIRED',
        );
      }

      const role = req.membership.role;
      const permitted = requiredPermissions.some((p) => hasPermission(role, p));

      if (!permitted) {
        throw new ForbiddenError(
          `You do not have the required permission (${requiredPermissions.join(', ')})`,
          'PERMISSION_DENIED',
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requirePermission };
