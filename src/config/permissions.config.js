// ============================================================
// DocQuery — Permissions & RBAC Matrix
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

const PERMISSIONS = {
  // Organizations
  ORGANIZATION_READ: 'ORGANIZATION_READ',
  ORGANIZATION_UPDATE: 'ORGANIZATION_UPDATE',
  ORGANIZATION_DELETE: 'ORGANIZATION_DELETE',

  // Members
  MEMBER_READ: 'MEMBER_READ',
  MEMBER_INVITE: 'MEMBER_INVITE',
  MEMBER_UPDATE: 'MEMBER_UPDATE',
  MEMBER_REMOVE: 'MEMBER_REMOVE',

  // Documents
  DOCUMENT_READ: 'DOCUMENT_READ',
  DOCUMENT_CREATE: 'DOCUMENT_CREATE',
  DOCUMENT_UPDATE: 'DOCUMENT_UPDATE',
  DOCUMENT_DELETE: 'DOCUMENT_DELETE',
  DOCUMENT_SHARE: 'DOCUMENT_SHARE',

  // Conversations
  CONVERSATION_READ: 'CONVERSATION_READ',
  CONVERSATION_CREATE: 'CONVERSATION_CREATE',
  CONVERSATION_DELETE: 'CONVERSATION_DELETE',

  // Queries & Search
  QUERY_EXECUTE: 'QUERY_EXECUTE',
  SEARCH_EXECUTE: 'SEARCH_EXECUTE',

  // API Keys
  API_KEY_READ: 'API_KEY_READ',
  API_KEY_CREATE: 'API_KEY_CREATE',
  API_KEY_REVOKE: 'API_KEY_REVOKE',

  // Audit Logs & Compliance
  AUDIT_READ: 'AUDIT_READ',

  // Usage & Quotas
  USAGE_READ: 'USAGE_READ',
  QUOTA_MANAGE: 'QUOTA_MANAGE',

  // Knowledge Graph
  GRAPH_READ: 'GRAPH_READ',
  GRAPH_MANAGE: 'GRAPH_MANAGE',

  // Evaluations
  EVALUATION_READ: 'EVALUATION_READ',
  EVALUATION_MANAGE: 'EVALUATION_MANAGE',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ROLE_PERMISSIONS = {
  OWNER: ALL_PERMISSIONS,

  ADMIN: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.ORGANIZATION_DELETE),

  MEMBER: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.DOCUMENT_SHARE,
    PERMISSIONS.CONVERSATION_READ,
    PERMISSIONS.CONVERSATION_CREATE,
    PERMISSIONS.CONVERSATION_DELETE,
    PERMISSIONS.QUERY_EXECUTE,
    PERMISSIONS.SEARCH_EXECUTE,
    PERMISSIONS.GRAPH_READ,
    PERMISSIONS.EVALUATION_READ,
    PERMISSIONS.USAGE_READ,
  ],

  VIEWER: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.CONVERSATION_READ,
    PERMISSIONS.QUERY_EXECUTE,
    PERMISSIONS.SEARCH_EXECUTE,
    PERMISSIONS.GRAPH_READ,
    PERMISSIONS.EVALUATION_READ,
  ],
};

/**
 * Check whether a role has a given permission.
 * @param {string} role - OrganizationRole ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
 * @param {string} permission - PERMISSIONS constant
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  return granted.includes(permission);
}

/**
 * Get all permissions assigned to a role.
 * @param {string} role
 * @returns {string[]}
 */
function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
};
