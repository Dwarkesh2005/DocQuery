const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { prisma } = require('../src/config/database');
const { generateAccessToken } = require('../src/utils/jwt');

describe('Document API Endpoints', () => {
  let userA, userB;
  let tokenA, tokenB;
  let orgA, orgB;
  const tempFiles = [];

  beforeAll(async () => {
    // User & Org A
    userA = await prisma.user.create({
      data: {
        email: `doc-api-usera-${Date.now()}@example.com`,
        name: 'User A',
        passwordHash: 'hash',
      },
    });
    orgA = await prisma.organization.create({
      data: {
        name: 'Doc Org A',
        memberships: {
          create: { userId: userA.id, role: 'OWNER' },
        },
      },
    });
    tokenA = generateAccessToken(userA.id);

    // User & Org B
    userB = await prisma.user.create({
      data: {
        email: `doc-api-userb-${Date.now()}@example.com`,
        name: 'User B',
        passwordHash: 'hash',
      },
    });
    orgB = await prisma.organization.create({
      data: {
        name: 'Doc Org B',
        memberships: {
          create: { userId: userB.id, role: 'OWNER' },
        },
      },
    });
    tokenB = generateAccessToken(userB.id);
  });

  afterAll(async () => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }

    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/documents (Upload)', () => {
    it('should successfully upload a text document and set status to UPLOADED', async () => {
      const filePath = path.resolve(`./uploads/api_test_${Date.now()}.txt`);
      tempFiles.push(filePath);
      fs.writeFileSync(filePath, 'API upload test file content for Phase 3 testing.');

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id)
        .attach('file', filePath);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.document).toBeDefined();
      expect(res.body.data.document.status).toBe('UPLOADED');
      expect(res.body.data.document.organizationId).toBe(orgA.id);
    });

    it('should reject upload without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    it('should reject upload without X-Organization-Id header', async () => {
      const filePath = path.resolve(`./uploads/api_test_noorg_${Date.now()}.txt`);
      tempFiles.push(filePath);
      fs.writeFileSync(filePath, 'No org upload.');

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', filePath);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORG_HEADER_REQUIRED');
    });
  });

  describe('POST /api/v1/documents/:id/process', () => {
    let documentA;

    beforeEach(async () => {
      const filePath = path.resolve(`./uploads/api_proc_${Date.now()}.txt`);
      tempFiles.push(filePath);
      fs.writeFileSync(filePath, 'File to be queued for processing.');

      documentA = await prisma.document.create({
        data: {
          organizationId: orgA.id,
          userId: userA.id,
          name: 'process_me.txt',
          filePath,
          fileSize: 100,
          mimeType: 'text/plain',
          status: 'UPLOADED',
        },
      });
    });

    it('should enqueue document for processing and return QUEUED status', async () => {
      const res = await request(app)
        .post(`/api/v1/documents/${documentA.id}/process`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.documentId).toBe(documentA.id);
      expect(res.body.data.status).toBe('QUEUED');

      // Verify DB status updated to QUEUED
      const updatedDoc = await prisma.document.findUnique({
        where: { id: documentA.id },
      });
      expect(updatedDoc.status).toBe('QUEUED');
    });

    it('should reject processing when document is already QUEUED (duplicate processing prevention)', async () => {
      // First process call
      await request(app)
        .post(`/api/v1/documents/${documentA.id}/process`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      // Second immediate call
      const res = await request(app)
        .post(`/api/v1/documents/${documentA.id}/process`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DOCUMENT_ALREADY_PROCESSING');
    });

    it('should deny processing across tenant boundaries (User B attempting to process Org A doc)', async () => {
      const res = await request(app)
        .post(`/api/v1/documents/${documentA.id}/process`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    it('should return 422 for invalid UUID param', async () => {
      const res = await request(app)
        .post('/api/v1/documents/not-a-uuid/process')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/documents/:id', () => {
    let documentA;

    beforeEach(async () => {
      const filePath = path.resolve(`./uploads/api_get_${Date.now()}.txt`);
      tempFiles.push(filePath);
      fs.writeFileSync(filePath, 'Document detail test.');

      documentA = await prisma.document.create({
        data: {
          organizationId: orgA.id,
          userId: userA.id,
          name: 'details.txt',
          filePath,
          fileSize: 100,
          mimeType: 'text/plain',
          status: 'READY',
          pageCount: 1,
        },
      });
    });

    it('should return document metadata and status', async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${documentA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.document.id).toBe(documentA.id);
      expect(res.body.data.document.status).toBe('READY');
    });

    it('should return 404 for document belonging to another organization', async () => {
      const res = await request(app)
        .get(`/api/v1/documents/${documentA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/documents', () => {
    it('should list documents for current organization with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.documents)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });
  });
});
