const { prisma } = require('../../../config/database');
const { ForbiddenError, NotFoundError } = require('../../../utils/errors');

// ============================================================
// Document Access & Resource-Level Permission Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

const PERMISSION_HIERARCHY = {
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

class DocumentAccessService {
  /**
   * Determine if a user with a given role has the required permission level on a document.
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.userRole - OrganizationRole ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')
   * @param {string} params.organizationId
   * @param {string} params.documentId
   * @param {string} [params.requiredLevel='READ'] - 'READ' | 'WRITE' | 'ADMIN'
   * @returns {Promise<boolean>}
   */
  async canAccessDocument({ userId, userRole, organizationId, documentId, requiredLevel = 'READ' }) {
    // 1. Organization OWNER & ADMIN have full ADMIN access across all tenant documents
    if (userRole === 'OWNER' || userRole === 'ADMIN') {
      return true;
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: { permissions: true },
    });

    if (!doc) {
      return false;
    }

    // 2. Document creator always has full access
    if (doc.userId === userId) {
      return true;
    }

    const requiredWeight = PERMISSION_HIERARCHY[requiredLevel] || 1;

    // 3. If no custom permissions exist, default org-wide access applies based on role
    if (!doc.permissions || doc.permissions.length === 0) {
      if (requiredLevel === 'READ') return true;
      if (requiredLevel === 'WRITE' && userRole !== 'VIEWER') return true;
      return false; // Only creator/admin has ADMIN level
    }

    // 4. Check explicit permissions
    for (const perm of doc.permissions) {
      const grantWeight = PERMISSION_HIERARCHY[perm.permission] || 1;
      if (grantWeight < requiredWeight) continue;

      if (perm.granteeType === 'ORGANIZATION') {
        return true;
      }
      if (perm.granteeType === 'USER' && perm.granteeId === userId) {
        return true;
      }
      if (perm.granteeType === 'ROLE' && perm.granteeRole === userRole) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all document IDs accessible to a user within an organization for pre-filtering retrieval.
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.userRole
   * @param {string} params.organizationId
   * @param {string} [params.requiredLevel='READ']
   * @returns {Promise<string[]|null>} Array of accessible UUIDs, or null if all org documents are accessible.
   */
  async getAccessibleDocumentIds({ userId, userRole, organizationId, requiredLevel = 'READ' }) {
    // Org OWNER and ADMIN can access all documents in the organization
    if (userRole === 'OWNER' || userRole === 'ADMIN') {
      return null; // null represents unscoped (all org docs accessible)
    }

    // Fetch all documents in organization with their permissions
    const docs = await prisma.document.findMany({
      where: { organizationId },
      select: {
        id: true,
        userId: true,
        permissions: {
          select: {
            granteeType: true,
            granteeId: true,
            granteeRole: true,
            permission: true,
          },
        },
      },
    });

    const requiredWeight = PERMISSION_HIERARCHY[requiredLevel] || 1;
    const accessibleIds = [];

    for (const doc of docs) {
      // Creator always has access
      if (doc.userId === userId) {
        accessibleIds.push(doc.id);
        continue;
      }

      // Default org access if no restrictions configured
      if (!doc.permissions || doc.permissions.length === 0) {
        if (requiredLevel === 'READ') {
          accessibleIds.push(doc.id);
        } else if (requiredLevel === 'WRITE' && userRole !== 'VIEWER') {
          accessibleIds.push(doc.id);
        }
        continue;
      }

      // Check explicit grants
      const hasGrant = doc.permissions.some((perm) => {
        const grantWeight = PERMISSION_HIERARCHY[perm.permission] || 1;
        if (grantWeight < requiredWeight) return false;

        if (perm.granteeType === 'ORGANIZATION') return true;
        if (perm.granteeType === 'USER' && perm.granteeId === userId) return true;
        if (perm.granteeType === 'ROLE' && perm.granteeRole === userRole) return true;
        return false;
      });

      if (hasGrant) {
        accessibleIds.push(doc.id);
      }
    }

    return accessibleIds;
  }

  /**
   * Grant a permission on a document.
   */
  async grantPermission({ organizationId, documentId, actorUserId, actorRole, granteeType, granteeId, granteeRole, permission }) {
    const hasAdmin = await this.canAccessDocument({
      userId: actorUserId,
      userRole: actorRole,
      organizationId,
      documentId,
      requiredLevel: 'ADMIN',
    });

    if (!hasAdmin) {
      throw new ForbiddenError('You do not have permission to manage access for this document', 'DOCUMENT_ACCESS_DENIED');
    }

    return prisma.documentPermission.create({
      data: {
        documentId,
        granteeType,
        granteeId: granteeId || null,
        granteeRole: granteeRole || null,
        permission: permission || 'READ',
      },
    });
  }

  /**
   * List all permissions on a document.
   */
  async listPermissions({ organizationId, documentId, actorUserId, actorRole }) {
    const canRead = await this.canAccessDocument({
      userId: actorUserId,
      userRole: actorRole,
      organizationId,
      documentId,
      requiredLevel: 'READ',
    });

    if (!canRead) {
      throw new ForbiddenError('Access denied to document permissions', 'DOCUMENT_ACCESS_DENIED');
    }

    return prisma.documentPermission.findMany({
      where: { documentId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Revoke an explicit document permission.
   */
  async revokePermission({ organizationId, documentId, permissionId, actorUserId, actorRole }) {
    const hasAdmin = await this.canAccessDocument({
      userId: actorUserId,
      userRole: actorRole,
      organizationId,
      documentId,
      requiredLevel: 'ADMIN',
    });

    if (!hasAdmin) {
      throw new ForbiddenError('You do not have permission to revoke access for this document', 'DOCUMENT_ACCESS_DENIED');
    }

    const perm = await prisma.documentPermission.findFirst({
      where: { id: permissionId, documentId },
    });

    if (!perm) {
      throw new NotFoundError('Permission grant not found', 'PERMISSION_NOT_FOUND');
    }

    return prisma.documentPermission.delete({
      where: { id: permissionId },
    });
  }
}

const documentAccessService = new DocumentAccessService();

module.exports = {
  DocumentAccessService,
  documentAccessService,
  PERMISSION_HIERARCHY,
};
