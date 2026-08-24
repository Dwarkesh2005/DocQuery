const request = require('supertest');
const app = require('../src/app');
const { prisma, cleanDatabase } = require('./setup');
const { generateAccessToken } = require('../src/utils/jwt');
const { auditService } = require('../src/services/audit.service');

describe('Phase 9.8 — Immutable Audit Logging', () => {
  let userOwner, userMember, tokenOwner, tokenMember;
  let org;

  beforeEach(async () => {
    await cleanDatabase();

    org = await prisma.organization.create({
      data: { name: 'Audit Compliance Org' },
    });

    userOwner = await prisma.user.create({
      data: { email: 'auditor@acme.com', passwordHash: 'hash', name: 'Auditor' },
    });
    userMember = await prisma.user.create({
      data: { email: 'auditmemb@acme.com', passwordHash: 'hash', name: 'Audit Member' },
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

  it('should record audit log entries with sanitized metadata', async () => {
    const entry = await auditService.log({
      organizationId: org.id,
      userId: userOwner.id,
      action: 'DOCUMENT_UPLOADED',
      resourceType: 'DOCUMENT',
      resourceId: 'doc-123',
      requestId: 'req-abc',
      metadata: {
        filename: 'Quarterly.pdf',
        secretNote: 'sk-123456789012345678901234',
      },
    });

    expect(entry).toBeDefined();
    expect(entry.action).toBe('DOCUMENT_UPLOADED');
    // Verify PII/secret in metadata was redacted
    expect(entry.metadata.secretNote).toContain('[API_KEY_REDACTED]');
  });

  it('should allow OWNER/ADMIN to query and filter audit logs', async () => {
    await auditService.log({
      organizationId: org.id,
      userId: userOwner.id,
      action: 'API_KEY_CREATED',
      resourceType: 'API_KEY',
    });
    await auditService.log({
      organizationId: org.id,
      userId: userOwner.id,
      action: 'DOCUMENT_DELETED',
      resourceType: 'DOCUMENT',
    });

    const res = await request(app)
      .get('/api/v1/audit-logs?action=API_KEY_CREATED')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .set('X-Organization-Id', org.id);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logs.length).toBe(1);
    expect(res.body.data.logs[0].action).toBe('API_KEY_CREATED');
  });

  it('should deny non-admin members from querying audit logs', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${tokenMember}`)
      .set('X-Organization-Id', org.id);

    expect(res.status).toBe(403);
  });
});
