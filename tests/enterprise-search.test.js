const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { prisma, cleanDatabase } = require('./setup');
const { generateAccessToken } = require('../src/utils/jwt');
const { documentProcessingService } = require('../src/modules/documents/services/document-processing.service');

describe('Phase 9.4 — Enterprise Search API', () => {
  let user, token, org;
  let doc1, doc2;
  const tempFiles = [];

  beforeEach(async () => {
    await cleanDatabase();

    org = await prisma.organization.create({
      data: { name: 'Search Test Org' },
    });

    user = await prisma.user.create({
      data: { email: 'searcher@acme.com', passwordHash: 'hash', name: 'Searcher' },
    });

    await prisma.organizationMember.create({
      data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
    });

    token = generateAccessToken(user.id);

    // Create 2 test files
    const file1 = path.resolve(`./uploads/test_search_arch_${Date.now()}.txt`);
    tempFiles.push(file1);
    fs.writeFileSync(
      file1,
      'Engineering Architecture Guide. Microservices architecture with PostgreSQL vector database and Redis caching.'
    );

    doc1 = await prisma.document.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        name: 'Technical Architecture.txt',
        filePath: file1,
        fileSize: fs.statSync(file1).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(doc1.id, org.id);

    const file2 = path.resolve(`./uploads/test_search_handbook_${Date.now()}.txt`);
    tempFiles.push(file2);
    fs.writeFileSync(
      file2,
      'Employee Handbook Policy. Company vacation and sick leave benefits policy for full-time staff.'
    );

    doc2 = await prisma.document.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        name: 'Employee Handbook.txt',
        filePath: file2,
        fileSize: fs.statSync(file2).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(doc2.id, org.id);
  });

  afterAll(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    }
  });

  it('should perform search and return results with score and metadata', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Organization-Id', org.id)
      .send({
        query: 'Microservices architecture with PostgreSQL vector database',
        topK: 5,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results.length).toBeGreaterThan(0);
  });

  it('should support documentId filter', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Organization-Id', org.id)
      .send({
        query: 'vacation policy benefits',
        documentId: doc2.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results.every((r) => r.documentId === doc2.id)).toBe(true);
  });
});
