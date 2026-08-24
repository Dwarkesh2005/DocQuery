const request = require('supertest');
const app = require('../src/app');
const { prisma, cleanDatabase } = require('./setup');
const { generateAccessToken } = require('../src/utils/jwt');
const { apiKeyService } = require('../src/modules/api-keys/api-key.service');

describe('Phase 9.10 — Enterprise Cross-Tenant Security & Isolation', () => {
  let orgA, orgB;
  let userA, userB;
  let tokenA, tokenB;
  let docA, docB;
  let apiKeyA, rawKeyA;

  beforeEach(async () => {
    await cleanDatabase();

    // 1. Setup Tenant A
    orgA = await prisma.organization.create({ data: { name: 'Tenant Alpha' } });
    userA = await prisma.user.create({ data: { email: 'alice@alpha.com', passwordHash: 'h', name: 'Alice' } });
    await prisma.organizationMember.create({ data: { userId: userA.id, organizationId: orgA.id, role: 'OWNER' } });
    tokenA = generateAccessToken({ sub: userA.id, email: userA.email });

    docA = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        name: 'Alpha Confidential.pdf',
        filePath: 'uploads/alpha.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });

    const keyResA = await apiKeyService.createApiKey({
      organizationId: orgA.id,
      userId: userA.id,
      name: 'Alpha Key',
    });
    apiKeyA = keyResA.apiKey;
    rawKeyA = keyResA.rawKey;

    // 2. Setup Tenant B
    orgB = await prisma.organization.create({ data: { name: 'Tenant Beta' } });
    userB = await prisma.user.create({ data: { email: 'bob@beta.com', passwordHash: 'h', name: 'Bob' } });
    await prisma.organizationMember.create({ data: { userId: userB.id, organizationId: orgB.id, role: 'OWNER' } });
    tokenB = generateAccessToken({ sub: userB.id, email: userB.email });

    docB = await prisma.document.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        name: 'Beta Secret Strategy.pdf',
        filePath: 'uploads/beta.pdf',
        fileSize: 1500,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });
  });

  it('should prevent User A from accessing Document B metadata (IDOR protection)', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${docB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id);

    expect(res.status).toBe(404);
  });

  it('should prevent User A from accessing Organization B even if X-Organization-Id is set to Org B', async () => {
    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgB.id);

    expect(res.status).toBe(403);
  });

  it('should prevent API Key A from querying Organization B data', async () => {
    const res = await request(app)
      .get('/api/v1/documents')
      .set('X-API-Key', rawKeyA)
      .set('X-Organization-Id', orgB.id);

    expect(res.status).toBe(403);
  });

  it('should isolate audit logs so Tenant A cannot view Tenant B logs', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id);

    expect(res.status).toBe(200);
    // Audit logs must only contain Org A events
    const logs = res.body.data.logs;
    expect(logs.every((l) => l.organizationId === orgA.id)).toBe(true);
  });

  it('should isolate usage and quota metrics across organizations', async () => {
    const res = await request(app)
      .get(`/api/v1/organizations/${orgB.id}/quota`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });
});
