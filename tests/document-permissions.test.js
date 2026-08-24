const request = require('supertest');
const app = require('../src/app');
const { prisma, cleanDatabase } = require('./setup');
const { generateAccessToken } = require('../src/utils/jwt');
const { documentAccessService } = require('../src/modules/documents/services/document-access.service');

describe('Phase 9.2 — Resource-Level Document Access & Permissions', () => {
  let userOwner, userMember1, userMember2;
  let tokenOwner, tokenMember1, tokenMember2;
  let org;
  let doc1;

  beforeEach(async () => {
    await cleanDatabase();

    // 1. Create Organization
    org = await prisma.organization.create({
      data: { name: 'Acme Security Org' },
    });

    // 2. Create Users
    userOwner = await prisma.user.create({
      data: { email: 'owner@acme.com', passwordHash: 'hash', name: 'Owner User' },
    });
    userMember1 = await prisma.user.create({
      data: { email: 'm1@acme.com', passwordHash: 'hash', name: 'Member One' },
    });
    userMember2 = await prisma.user.create({
      data: { email: 'm2@acme.com', passwordHash: 'hash', name: 'Member Two' },
    });

    // 3. Assign Memberships
    await prisma.organizationMember.createMany({
      data: [
        { userId: userOwner.id, organizationId: org.id, role: 'OWNER' },
        { userId: userMember1.id, organizationId: org.id, role: 'MEMBER' },
        { userId: userMember2.id, organizationId: org.id, role: 'MEMBER' },
      ],
    });

    // 4. Generate Auth Tokens
    tokenOwner = generateAccessToken({ sub: userOwner.id, email: userOwner.email });
    tokenMember1 = generateAccessToken({ sub: userMember1.id, email: userMember1.email });
    tokenMember2 = generateAccessToken({ sub: userMember2.id, email: userMember2.email });

    // 5. Create Document owned by Member 1
    doc1 = await prisma.document.create({
      data: {
        organizationId: org.id,
        userId: userMember1.id,
        name: 'Confidential Strategy.pdf',
        filePath: 'uploads/confidential.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });
  });

  describe('DocumentAccessService Evaluation', () => {
    it('should grant document creator ADMIN access', async () => {
      const canAdmin = await documentAccessService.canAccessDocument({
        userId: userMember1.id,
        userRole: 'MEMBER',
        organizationId: org.id,
        documentId: doc1.id,
        requiredLevel: 'ADMIN',
      });
      expect(canAdmin).toBe(true);
    });

    it('should grant organization OWNER full ADMIN access to any document', async () => {
      const canAdmin = await documentAccessService.canAccessDocument({
        userId: userOwner.id,
        userRole: 'OWNER',
        organizationId: org.id,
        documentId: doc1.id,
        requiredLevel: 'ADMIN',
      });
      expect(canAdmin).toBe(true);
    });

    it('should grant specific USER permission when explicitly shared', async () => {
      // Initially Member 2 has default org access
      // Restrict document by adding a permission only for Member 1 and Member 2 with READ
      await prisma.documentPermission.create({
        data: {
          documentId: doc1.id,
          granteeType: 'USER',
          granteeId: userMember2.id,
          permission: 'READ',
        },
      });

      const canRead = await documentAccessService.canAccessDocument({
        userId: userMember2.id,
        userRole: 'MEMBER',
        organizationId: org.id,
        documentId: doc1.id,
        requiredLevel: 'READ',
      });
      expect(canRead).toBe(true);

      const canWrite = await documentAccessService.canAccessDocument({
        userId: userMember2.id,
        userRole: 'MEMBER',
        organizationId: org.id,
        documentId: doc1.id,
        requiredLevel: 'WRITE',
      });
      expect(canWrite).toBe(false);
    });

    it('should calculate accessible document IDs for pre-retrieval filtering', async () => {
      const doc2 = await prisma.document.create({
        data: {
          organizationId: org.id,
          userId: userOwner.id,
          name: 'Restricted Executive Memo.pdf',
          filePath: 'uploads/memo.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          status: 'READY',
        },
      });

      // Restrict doc2 to OWNER role only
      await prisma.documentPermission.create({
        data: {
          documentId: doc2.id,
          granteeType: 'ROLE',
          granteeRole: 'OWNER',
          permission: 'READ',
        },
      });

      // Member 1 can access doc1 (creator) but not doc2
      const accessibleForMember1 = await documentAccessService.getAccessibleDocumentIds({
        userId: userMember1.id,
        userRole: 'MEMBER',
        organizationId: org.id,
        requiredLevel: 'READ',
      });

      expect(accessibleForMember1).toContain(doc1.id);
      expect(accessibleForMember1).not.toContain(doc2.id);

      // Owner gets null (unrestricted access)
      const accessibleForOwner = await documentAccessService.getAccessibleDocumentIds({
        userId: userOwner.id,
        userRole: 'OWNER',
        organizationId: org.id,
      });
      expect(accessibleForOwner).toBeNull();
    });
  });

  describe('Document Permissions REST APIs', () => {
    it('should allow document admin to grant, list, and revoke permissions', async () => {
      // 1. Grant Permission to Member 2
      const grantRes = await request(app)
        .post(`/api/v1/documents/${doc1.id}/permissions`)
        .set('Authorization', `Bearer ${tokenMember1}`)
        .set('X-Organization-Id', org.id)
        .send({
          granteeType: 'USER',
          granteeId: userMember2.id,
          permission: 'WRITE',
        });

      expect(grantRes.status).toBe(201);
      expect(grantRes.body.success).toBe(true);
      const permId = grantRes.body.data.permission.id;

      // 2. List Permissions
      const listRes = await request(app)
        .get(`/api/v1/documents/${doc1.id}/permissions`)
        .set('Authorization', `Bearer ${tokenMember1}`)
        .set('X-Organization-Id', org.id);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.permissions.length).toBeGreaterThanOrEqual(1);

      // 3. Revoke Permission
      const revokeRes = await request(app)
        .delete(`/api/v1/documents/${doc1.id}/permissions/${permId}`)
        .set('Authorization', `Bearer ${tokenMember1}`)
        .set('X-Organization-Id', org.id);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
    });
  });
});
