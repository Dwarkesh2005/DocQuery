const request = require('supertest');
const app = require('../src/app');
const { prisma, cleanDatabase } = require('./setup');
const { generateAccessToken } = require('../src/utils/jwt');
const { apiKeyService } = require('../src/modules/api-keys/api-key.service');

describe('Phase 9.3 — Developer API Keys & Dual Authentication', () => {
  let userOwner, userMember;
  let tokenOwner, tokenMember;
  let org;

  beforeEach(async () => {
    await cleanDatabase();

    org = await prisma.organization.create({
      data: { name: 'Acme Developer Org' },
    });

    userOwner = await prisma.user.create({
      data: { email: 'devowner@acme.com', passwordHash: 'hash', name: 'Dev Owner' },
    });
    userMember = await prisma.user.create({
      data: { email: 'devmember@acme.com', passwordHash: 'hash', name: 'Dev Member' },
    });

    await prisma.organizationMember.createMany({
      data: [
        { userId: userOwner.id, organizationId: org.id, role: 'OWNER' },
        { userId: userMember.id, organizationId: org.id, role: 'MEMBER' },
      ],
    });

    tokenOwner = generateAccessToken({ sub: userOwner.id, email: userOwner.email });
    tokenMember = generateAccessToken({ sub: userMember.id, email: userMember.email });
  });

  describe('API Key Lifecycle & Management', () => {
    it('should create API key, store only hashed secret, and return raw secret once', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Organization-Id', org.id)
        .send({
          name: 'Production Ingestion Service',
          scopes: ['documents:read', 'documents:write'],
          expiresInDays: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rawKey).toMatch(/^dq_live_[a-f0-9]{8}_[a-f0-9]{64}$/);
      expect(res.body.data.apiKey.name).toBe('Production Ingestion Service');
      expect(res.body.data.apiKey.keyPrefix).toBeDefined();

      // Verify in DB that raw secret is NOT stored
      const dbKey = await prisma.apiKey.findUnique({
        where: { id: res.body.data.apiKey.id },
      });
      expect(dbKey.hashedSecret).not.toBe(res.body.data.rawKey);
      expect(dbKey.hashedSecret).toBe(apiKeyService.hashSecret(res.body.data.rawKey));
    });

    it('should reject non-admin members from creating API keys', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .set('Authorization', `Bearer ${tokenMember}`)
        .set('X-Organization-Id', org.id)
        .send({
          name: 'Unauthorized Key',
        });

      expect(res.status).toBe(403);
    });

    it('should list API keys without exposing secrets', async () => {
      await apiKeyService.createApiKey({
        organizationId: org.id,
        userId: userOwner.id,
        name: 'Key 1',
      });

      const res = await request(app)
        .get('/api/v1/api-keys')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Organization-Id', org.id);

      expect(res.status).toBe(200);
      expect(res.body.data.apiKeys.length).toBe(1);
      expect(res.body.data.apiKeys[0].hashedSecret).toBeUndefined();
      expect(res.body.data.apiKeys[0].keyPrefix).toBeDefined();
    });

    it('should rotate an API key generating a new secret and invalidating the old secret', async () => {
      const { apiKey, rawKey: oldRawKey } = await apiKeyService.createApiKey({
        organizationId: org.id,
        userId: userOwner.id,
        name: 'Rotatable Key',
      });

      const rotateRes = await request(app)
        .post(`/api/v1/api-keys/${apiKey.id}/rotate`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Organization-Id', org.id);

      expect(rotateRes.status).toBe(200);
      const newRawKey = rotateRes.body.data.rawKey;
      expect(newRawKey).not.toBe(oldRawKey);

      // Old key should now fail validation
      await expect(apiKeyService.validateApiKey(oldRawKey)).rejects.toThrow();

      // New key should succeed
      const valid = await apiKeyService.validateApiKey(newRawKey);
      expect(valid.id).toBe(apiKey.id);
    });

    it('should revoke an API key and reject subsequent requests', async () => {
      const { apiKey, rawKey } = await apiKeyService.createApiKey({
        organizationId: org.id,
        userId: userOwner.id,
        name: 'Key to Revoke',
      });

      const revokeRes = await request(app)
        .delete(`/api/v1/api-keys/${apiKey.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Organization-Id', org.id);

      expect(revokeRes.status).toBe(200);

      // Subsequent API request with revoked key should fail with 401
      const docRes = await request(app)
        .get('/api/v1/documents')
        .set('X-API-Key', rawKey);

      expect(docRes.status).toBe(401);
    });
  });

  describe('API Key Authentication via Headers', () => {
    it('should authenticate requests using X-API-Key header', async () => {
      const { rawKey } = await apiKeyService.createApiKey({
        organizationId: org.id,
        userId: userOwner.id,
        name: 'Service Key',
      });

      const res = await request(app)
        .get('/api/v1/documents')
        .set('X-API-Key', rawKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should authenticate requests using Bearer <apiKey> Authorization header', async () => {
      const { rawKey } = await apiKeyService.createApiKey({
        organizationId: org.id,
        userId: userOwner.id,
        name: 'Bearer Service Key',
      });

      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${rawKey}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
