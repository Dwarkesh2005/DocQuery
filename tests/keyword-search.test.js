const { keywordSearchService } = require('../src/modules/search/services/keyword-search.service');
const { searchRepository } = require('../src/modules/search/search.repository');
const { documentChunkRepository } = require('../src/modules/documents/repositories/document-chunk.repository');
const { cleanDatabase, disconnectDatabase, prisma } = require('./setup');

describe('Phase 8.4 — PostgreSQL Full-Text Keyword Search', () => {
  let userA, userB, orgA, orgB, docA1, docA2, docB;

  beforeEach(async () => {
    await cleanDatabase();

    // Org A setup
    userA = await prisma.user.create({
      data: { email: `user_a_${Date.now()}@test.com`, passwordHash: 'hash', name: 'User A' },
    });
    orgA = await prisma.organization.create({ data: { name: 'Org A' } });
    await prisma.organizationMember.create({
      data: { userId: userA.id, organizationId: orgA.id, role: 'OWNER' },
    });

    // Org B setup
    userB = await prisma.user.create({
      data: { email: `user_b_${Date.now()}@test.com`, passwordHash: 'hash', name: 'User B' },
    });
    orgB = await prisma.organization.create({ data: { name: 'Org B' } });
    await prisma.organizationMember.create({
      data: { userId: userB.id, organizationId: orgB.id, role: 'OWNER' },
    });

    // Create Documents for Org A
    docA1 = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        name: 'refund_policy.pdf',
        filePath: '/tmp/refund.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });

    docA2 = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        name: 'vacation_policy.pdf',
        filePath: '/tmp/vacation.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });

    // Create Document for Org B
    docB = await prisma.document.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        name: 'secret_finance_org_b.pdf',
        filePath: '/tmp/secret.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });

    const dummyEmbedding = Array.from({ length: 1536 }, () => 0.01);

    // Save Chunks for Org A Doc 1
    await documentChunkRepository.saveChunksWithEmbeddings(docA1.id, [
      {
        chunkIndex: 0,
        content: 'Customers can request a full refund within 30 days of purchase for software licenses.',
        pageNumber: 1,
        embedding: dummyEmbedding,
      },
      {
        chunkIndex: 1,
        content: 'Exceptions apply to custom enterprise development services which are non-refundable.',
        pageNumber: 2,
        embedding: dummyEmbedding,
      },
    ]);

    // Save Chunks for Org A Doc 2
    await documentChunkRepository.saveChunksWithEmbeddings(docA2.id, [
      {
        chunkIndex: 0,
        content: 'Full-time employee vacation policy: accrue 20 paid vacation days each calendar year.',
        pageNumber: 1,
        embedding: dummyEmbedding,
      },
    ]);

    // Save Chunks for Org B Doc
    await documentChunkRepository.saveChunksWithEmbeddings(docB.id, [
      {
        chunkIndex: 0,
        content: 'Confidential Org B budget report: refund reserve is set to $500,000.',
        pageNumber: 1,
        embedding: dummyEmbedding,
      },
    ]);
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('should find relevant chunks matching lexical search keywords in PostgreSQL FTS', async () => {
    const result = await keywordSearchService.search({
      organizationId: orgA.id,
      query: 'refund software licenses',
      topK: 5,
    });

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0].content).toContain('full refund within 30 days');
    expect(result.results[0].score).toBeGreaterThan(0);
    expect(result.results[0].documentId).toBe(docA1.id);
  });

  it('should enforce strict tenant isolation (Org A cannot see Org B keywords)', async () => {
    const resultOrgA = await keywordSearchService.search({
      organizationId: orgA.id,
      query: 'budget reserve confidential',
      topK: 5,
    });

    // Org A should find 0 results for Org B's secret content
    expect(resultOrgA.results).toEqual([]);

    const resultOrgB = await keywordSearchService.search({
      organizationId: orgB.id,
      query: 'budget reserve confidential',
      topK: 5,
    });

    // Org B should find its own chunk
    expect(resultOrgB.results.length).toBe(1);
    expect(resultOrgB.results[0].documentId).toBe(docB.id);
  });

  it('should support documentId filtering in keyword search', async () => {
    const result = await keywordSearchService.search({
      organizationId: orgA.id,
      query: 'policy',
      documentId: docA2.id,
      topK: 5,
    });

    expect(result.results.length).toBe(1);
    expect(result.results[0].documentId).toBe(docA2.id);
    expect(result.results[0].content).toContain('paid vacation days');
  });

  it('should return empty results for queries with no matching terms', async () => {
    const result = await keywordSearchService.search({
      organizationId: orgA.id,
      query: 'astrophysics quantum gravitation telescope',
      topK: 5,
    });

    expect(result.results).toEqual([]);
  });
});
