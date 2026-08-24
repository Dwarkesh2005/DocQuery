const request = require('supertest');
const app = require('../src/app');
const { generateAccessToken } = require('../src/utils/jwt');
const { cleanDatabase, disconnectDatabase, prisma } = require('./setup');

describe('Phase 7.7 — Security Hardening & Isolation', () => {
  let userA, userB, orgA, orgB, tokenA, tokenB;

  beforeEach(async () => {
    await cleanDatabase();

    // Create User A in Org A
    userA = await prisma.user.create({
      data: {
        email: `usera_${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'User A',
      },
    });
    orgA = await prisma.organization.create({
      data: { name: 'Org A' },
    });
    await prisma.organizationMember.create({
      data: {
        userId: userA.id,
        organizationId: orgA.id,
        role: 'OWNER',
      },
    });
    tokenA = generateAccessToken(userA.id);

    // Create User B in Org B
    userB = await prisma.user.create({
      data: {
        email: `userb_${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'User B',
      },
    });
    orgB = await prisma.organization.create({
      data: { name: 'Org B' },
    });
    await prisma.organizationMember.create({
      data: {
        userId: userB.id,
        organizationId: orgB.id,
        role: 'OWNER',
      },
    });
    tokenB = generateAccessToken(userB.id);
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe('Multi-Tenant Isolation Verification', () => {
    it('should prevent Tenant B from accessing or viewing Tenant A documents', async () => {
      const docA = await prisma.document.create({
        data: {
          organizationId: orgA.id,
          userId: userA.id,
          name: 'secret-a.pdf',
          filePath: '/tmp/secret-a.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
          status: 'READY',
        },
      });

      // User B in Org B attempts to access Org A's document
      const res = await request(app)
        .get(`/api/v1/documents/${docA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    it('should prevent Tenant B from accessing or viewing Tenant A conversations', async () => {
      const convA = await prisma.conversation.create({
        data: {
          organizationId: orgA.id,
          userId: userA.id,
          title: 'Secret Strategy A',
        },
      });

      // User B attempts to access Org A's conversation
      const res = await request(app)
        .get(`/api/v1/conversations/${convA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should prevent Tenant B from listing messages in Tenant A conversation', async () => {
      const convA = await prisma.conversation.create({
        data: {
          organizationId: orgA.id,
          userId: userA.id,
          title: 'Secret Chat',
        },
      });

      await prisma.message.create({
        data: {
          conversationId: convA.id,
          role: 'USER',
          content: 'Confidential message',
        },
      });

      const res = await request(app)
        .get(`/api/v1/conversations/${convA.id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Authentication & JWT Validation', () => {
    it('should reject requests with missing Authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/documents')
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should reject requests with malformed or tampered JWT token', async () => {
      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });
  });

  describe('Error Response Sanitization & Security Headers', () => {
    it('should never expose stack traces or DB credentials on 404/400 errors', async () => {
      const res = await request(app)
        .get('/api/v1/documents/non-existent-endpoint-xyz')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('password');
      expect(JSON.stringify(res.body)).not.toContain('DATABASE_URL');
    });

    it('should set essential HTTP security headers via Helmet', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-dns-prefetch-control']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
