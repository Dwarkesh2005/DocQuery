const {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
} = require('../src/config/permissions.config');
const { requirePermission } = require('../src/middleware/permission.middleware');

describe('Phase 9.1 — Enterprise RBAC & Permissions Matrix', () => {
  describe('Permission Matrix Configuration', () => {
    it('should grant OWNER all permissions', () => {
      expect(hasPermission('OWNER', PERMISSIONS.ORGANIZATION_DELETE)).toBe(true);
      expect(hasPermission('OWNER', PERMISSIONS.MEMBER_REMOVE)).toBe(true);
      expect(hasPermission('OWNER', PERMISSIONS.DOCUMENT_DELETE)).toBe(true);
      expect(hasPermission('OWNER', PERMISSIONS.API_KEY_CREATE)).toBe(true);
      expect(hasPermission('OWNER', PERMISSIONS.AUDIT_READ)).toBe(true);
    });

    it('should grant ADMIN all administrative permissions except organization deletion', () => {
      expect(hasPermission('ADMIN', PERMISSIONS.ORGANIZATION_DELETE)).toBe(false);
      expect(hasPermission('ADMIN', PERMISSIONS.ORGANIZATION_UPDATE)).toBe(true);
      expect(hasPermission('ADMIN', PERMISSIONS.MEMBER_INVITE)).toBe(true);
      expect(hasPermission('ADMIN', PERMISSIONS.API_KEY_CREATE)).toBe(true);
      expect(hasPermission('ADMIN', PERMISSIONS.DOCUMENT_CREATE)).toBe(true);
      expect(hasPermission('ADMIN', PERMISSIONS.AUDIT_READ)).toBe(true);
    });

    it('should grant MEMBER document and query execution but restrict administrative functions', () => {
      expect(hasPermission('MEMBER', PERMISSIONS.DOCUMENT_CREATE)).toBe(true);
      expect(hasPermission('MEMBER', PERMISSIONS.QUERY_EXECUTE)).toBe(true);
      expect(hasPermission('MEMBER', PERMISSIONS.CONVERSATION_CREATE)).toBe(true);
      expect(hasPermission('MEMBER', PERMISSIONS.MEMBER_INVITE)).toBe(false);
      expect(hasPermission('MEMBER', PERMISSIONS.API_KEY_CREATE)).toBe(false);
      expect(hasPermission('MEMBER', PERMISSIONS.AUDIT_READ)).toBe(false);
    });

    it('should restrict VIEWER to read-only operations', () => {
      expect(hasPermission('VIEWER', PERMISSIONS.DOCUMENT_READ)).toBe(true);
      expect(hasPermission('VIEWER', PERMISSIONS.QUERY_EXECUTE)).toBe(true);
      expect(hasPermission('VIEWER', PERMISSIONS.CONVERSATION_READ)).toBe(true);
      expect(hasPermission('VIEWER', PERMISSIONS.DOCUMENT_CREATE)).toBe(false);
      expect(hasPermission('VIEWER', PERMISSIONS.DOCUMENT_UPDATE)).toBe(false);
      expect(hasPermission('VIEWER', PERMISSIONS.DOCUMENT_DELETE)).toBe(false);
      expect(hasPermission('VIEWER', PERMISSIONS.MEMBER_INVITE)).toBe(false);
    });

    it('should return empty permissions for unknown or invalid role', () => {
      expect(getPermissionsForRole('GUEST')).toEqual([]);
      expect(hasPermission(null, PERMISSIONS.DOCUMENT_READ)).toBe(false);
    });
  });

  describe('requirePermission Middleware', () => {
    it('should allow access when user membership possesses the required permission', () => {
      const middleware = requirePermission(PERMISSIONS.DOCUMENT_CREATE);
      const req = { membership: { role: 'MEMBER' } };
      const next = jest.fn();

      middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject access when user membership lacks the required permission', () => {
      const middleware = requirePermission(PERMISSIONS.AUDIT_READ);
      const req = { membership: { role: 'VIEWER' } };
      const next = jest.fn();

      middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.statusCode).toBe(403);
    });

    it('should allow API key requests with matching or wildcard scopes', () => {
      const middleware = requirePermission(PERMISSIONS.DOCUMENT_READ);
      const req = { apiKey: { scopes: ['documents:read'] } };
      const next = jest.fn();

      middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject API key requests lacking required scope', () => {
      const middleware = requirePermission(PERMISSIONS.API_KEY_CREATE);
      const req = { apiKey: { scopes: ['documents:read'] } };
      const next = jest.fn();

      middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('API_KEY_SCOPE_INSUFFICIENT');
    });
  });
});
