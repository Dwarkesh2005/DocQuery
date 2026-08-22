const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { prisma } = require('../src/config/database');
const { generateAccessToken } = require('../src/utils/jwt');
const { documentProcessingService } = require('../src/modules/documents/services/document-processing.service');

describe('Semantic Search API (POST /api/v1/search)', () => {
  let userA;
  let userB;
  let orgA;
  let orgB;
  let tokenA;
  let tokenB;
  let docA1;
  let docA2;
  let docB1;
  const tempFiles = [];

  beforeAll(async () => {
    // 1. Create User A & Org A
    userA = await prisma.user.create({
      data: {
        email: `search-usera-${Date.now()}@example.com`,
        name: 'User A',
        passwordHash: 'hash',
      },
    });

    orgA = await prisma.organization.create({
      data: {
        name: 'Organization Search A',
        memberships: {
          create: { userId: userA.id, role: 'OWNER' },
        },
      },
    });

    tokenA = generateAccessToken(userA.id);

    // 2. Create User B & Org B
    userB = await prisma.user.create({
      data: {
        email: `search-userb-${Date.now()}@example.com`,
        name: 'User B',
        passwordHash: 'hash',
      },
    });

    orgB = await prisma.organization.create({
      data: {
        name: 'Organization Search B',
        memberships: {
          create: { userId: userB.id, role: 'OWNER' },
        },
      },
    });

    tokenB = generateAccessToken(userB.id);

    // 3. Create sample indexed files and process them
    // Doc A1: Employee Handbook (Org A)
    const fileA1 = path.resolve(`./uploads/test_handbook_${Date.now()}.txt`);
    tempFiles.push(fileA1);
    fs.writeFileSync(
      fileA1,
      'DocQuery Company Handbook. Employees are entitled to 20 paid vacation days off from work every calendar year. Health insurance covers medical and dental.'
    );

    docA1 = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        name: 'handbook.txt',
        filePath: fileA1,
        fileSize: fs.statSync(fileA1).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(docA1.id, orgA.id);

    // Doc A2: Engineering Standards (Org A)
    const fileA2 = path.resolve(`./uploads/test_engineering_${Date.now()}.txt`);
    tempFiles.push(fileA2);
    fs.writeFileSync(
      fileA2,
      'Engineering Architecture Guide. All backend microservices use PostgreSQL with pgvector for high performance vector storage and indexing.'
    );

    docA2 = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        name: 'engineering.txt',
        filePath: fileA2,
        fileSize: fs.statSync(fileA2).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(docA2.id, orgA.id);

    // Doc B1: Competitor Confidential Doc (Org B)
    const fileB1 = path.resolve(`./uploads/test_confidential_b_${Date.now()}.txt`);
    tempFiles.push(fileB1);
    fs.writeFileSync(
      fileB1,
      'Confidential Org B Document: Exclusive vacation perks and executive bonuses for Organization B employees only.'
    );

    docB1 = await prisma.document.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        name: 'org_b_confidential.txt',
        filePath: fileB1,
        fileSize: fs.statSync(fileB1).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(docB1.id, orgB.id);
  });

  afterAll(async () => {
    // Clean up temporary files
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }

    // Clean up DB records
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.$disconnect();
  });

  // ── Test 1: Basic Semantic Search ──
  it('should return 200 with matching chunks and cosine similarity scores', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'What is the vacation policy?',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.query).toBe('What is the vacation policy?');
    expect(Array.isArray(res.body.data.results)).toBe(true);
    expect(res.body.data.results.length).toBeGreaterThan(0);

    const firstResult = res.body.data.results[0];
    expect(firstResult.chunkId).toBeDefined();
    expect(firstResult.documentId).toBe(docA1.id);
    expect(firstResult.content).toContain('paid vacation days');
    expect(typeof firstResult.score).toBe('number');
    expect(firstResult.score).toBeGreaterThan(0);
    expect(firstResult.chunkIndex).toBeDefined();
  });

  // ── Test 2: topK Parameter Bounding ──
  it('should respect topK parameter and bound results', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'vacation policy and paid time off',
        topK: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(1);
  });

  // ── Test 3: Document Filtering ──
  it('should filter results strictly by documentId when provided', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'PostgreSQL vector storage',
        documentId: docA2.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBeGreaterThan(0);
    for (const item of res.body.data.results) {
      expect(item.documentId).toBe(docA2.id);
    }
  });

  // ── Test 4: Tenant Isolation ⭐ ──
  it('should strictly isolate tenants and never return chunks from another organization', async () => {
    // Search as Org A for Org B content
    const resA = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'Confidential executive bonuses for Organization B',
      });

    expect(resA.status).toBe(200);
    for (const chunk of resA.body.data.results) {
      expect(chunk.documentId).not.toBe(docB1.id);
      expect(chunk.content).not.toContain('Organization B employees only');
    }

    // Search as Org B for Org B content
    const resB = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Organization-Id', orgB.id)
      .send({
        query: 'Confidential executive bonuses',
      });

    expect(resB.status).toBe(200);
    expect(resB.body.data.results.length).toBeGreaterThan(0);
    expect(resB.body.data.results[0].documentId).toBe(docB1.id);
  });

  // ── Test 5: Cross-Tenant Document ID ──
  it('should return 404 and prevent cross-tenant documentId access', async () => {
    // Org A user tries to query with Org B's documentId
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'Confidential bonuses',
        documentId: docB1.id,
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
  });

  // ── Test 6: Invalid Query Validation ──
  it('should return 422 for empty or whitespace-only queries', async () => {
    const res1 = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({ query: '' });

    expect(res1.status).toBe(422);
    expect(res1.body.success).toBe(false);

    const res2 = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({ query: '    ' });

    expect(res2.status).toBe(422);
    expect(res2.body.success).toBe(false);
  });

  // ── Test 7: Invalid topK Validation ──
  it('should return 422 for topK <= 0 or topK > maximum limit', async () => {
    const resZero = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({ query: 'vacation', topK: 0 });

    expect(resZero.status).toBe(422);
    expect(resZero.body.success).toBe(false);

    const resOverMax = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({ query: 'vacation', topK: 100 });

    expect(resOverMax.status).toBe(422);
    expect(resOverMax.body.success).toBe(false);
  });

  // ── Test 8: Similarity Threshold Filtering / Empty Results ──
  it('should filter out results below similarity threshold and return empty results array', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'What is the vacation policy?',
        threshold: 0.9999, // Unreachable similarity threshold
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.query).toBe('What is the vacation policy?');
    expect(res.body.data.results).toEqual([]);
  });

  it('should return empty results for completely irrelevant queries that fall below threshold', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'quantum mechanics gravitational waves astrophysics cosmology',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results).toEqual([]);
  });

  // ── Test 9: Authentication & Organization Resolution Errors ──
  it('should reject unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .send({ query: 'vacation' });

    expect(res.status).toBe(401);
  });

  it('should reject requests missing X-Organization-Id header with 400', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'vacation' });

    expect(res.status).toBe(400);
  });

  it('should reject requests with an unauthorized organization ID with 403', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgB.id) // userA is not a member of orgB
      .send({ query: 'vacation' });

    expect(res.status).toBe(403);
  });

  // ── Test 10: Search Quality Tests (Exact, Semantic, Paraphrased) ──
  it('should retrieve relevant chunk for exact, semantic, and paraphrased queries', async () => {
    const queries = [
      'What is the vacation policy?',
      'How much paid time off do employees receive?',
      'How many days can I take off from work?',
    ];

    for (const q of queries) {
      const res = await request(app)
        .post('/api/v1/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Organization-Id', orgA.id)
        .send({ query: q });

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      expect(res.body.data.results[0].documentId).toBe(docA1.id);
      expect(res.body.data.results[0].content).toContain('20 paid vacation days');
    }
  });

  // ── Test 11: Non-Ready Documents are Not Returned ──
  it('should not return chunks from documents that are not in READY status', async () => {
    // Create an unready document
    const unreadyDoc = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        name: 'unready.txt',
        filePath: './uploads/unready.txt',
        fileSize: 100,
        mimeType: 'text/plain',
        status: 'FAILED',
      },
    });

    const res = await request(app)
      .post('/api/v1/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Organization-Id', orgA.id)
      .send({
        query: 'unready content',
        documentId: unreadyDoc.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([]);
  });
});
