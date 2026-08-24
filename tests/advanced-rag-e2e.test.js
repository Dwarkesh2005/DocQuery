const { queryService } = require('../src/modules/query/query.service');
const { documentChunkRepository } = require('../src/modules/documents/repositories/document-chunk.repository');
const { cleanDatabase, disconnectDatabase, prisma } = require('./setup');

const { embeddingService } = require('../src/modules/documents/services/embedding.service');

describe('Phase 8.16 — Advanced RAG Pipeline End-to-End', () => {
  let user, org, doc;

  beforeEach(async () => {
    await cleanDatabase();

    user = await prisma.user.create({
      data: { email: `rag_e2e_${Date.now()}@test.com`, passwordHash: 'hash', name: 'RAG User' },
    });
    org = await prisma.organization.create({ data: { name: 'RAG Org' } });
    await prisma.organizationMember.create({
      data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
    });

    doc = await prisma.document.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        name: 'cloud_security_whitepaper.pdf',
        filePath: '/tmp/cloud_security.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        status: 'READY',
      },
    });

    const chunk1Text = 'All sensitive customer data must be encrypted at rest using AES-256 with keys rotated every 90 days.';
    const chunk2Text = 'Role-based access control (RBAC) is enforced across all production databases and Kubernetes clusters.';

    const [emb1, emb2] = await embeddingService.generateEmbeddings([chunk1Text, chunk2Text]);

    await documentChunkRepository.saveChunksWithEmbeddings(doc.id, [
      {
        chunkIndex: 0,
        content: chunk1Text,
        pageNumber: 4,
        metadata: { documentName: 'cloud_security_whitepaper.pdf' },
        embedding: emb1,
      },
      {
        chunkIndex: 1,
        content: chunk2Text,
        pageNumber: 5,
        metadata: { documentName: 'cloud_security_whitepaper.pdf' },
        embedding: emb2,
      },
    ]);
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('should execute full Advanced RAG pipeline with Hybrid Search, RRF, Reranking, and Citations', async () => {
    const result = await queryService.query({
      organizationId: org.id,
      query: 'What is the encryption standard for data at rest and how often are keys rotated?',
      answerMode: 'STRICT',
      enableHybrid: true,
      enableReranking: true,
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);

    // Verify Citations
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].documentId).toBe(doc.id);
    expect(result.citations[0].pageNumber).toBe(4);
    expect(result.citations[0].quote).toContain('AES-256');

    // Verify Comprehensive Metadata
    expect(result.metadata.retrievalStrategy).toBe('HYBRID_RRF');
    expect(result.metadata.answerMode).toBe('STRICT');
    expect(result.metadata.queryUnderstanding).toBeDefined();
    expect(result.metadata.queryUnderstanding.intent).toBe('factual');
    expect(result.metadata.queryUnderstanding.keywords).toContain('encryption');
    expect(result.metadata.retrievedChunks).toBeGreaterThan(0);
    expect(result.metadata.queryDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.retrievalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.understandingDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should execute multi-turn conversation with contextual query rewriting', async () => {
    const conversationHistory = [
      {
        role: 'USER',
        content: 'What is the encryption standard for sensitive customer data at rest?',
      },
      {
        role: 'ASSISTANT',
        content: 'Sensitive customer data is encrypted at rest using AES-256 with 90-day key rotation.',
      },
    ];

    const result = await queryService.query({
      organizationId: org.id,
      query: 'And how are production databases protected?',
      conversationHistory,
      answerMode: 'BALANCED',
      enableHybrid: true,
    });

    expect(result.answer).toBeDefined();
    expect(result.metadata.answerMode).toBe('BALANCED');
    expect(result.metadata.queryRewrite).toBeDefined();
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].content).toContain('Role-based access control');
  });

  it('should handle CONVERSATIONAL answer mode cleanly', async () => {
    const result = await queryService.query({
      organizationId: org.id,
      query: 'Can you summarize how keys are rotated?',
      answerMode: 'CONVERSATIONAL',
      enableHybrid: true,
    });

    expect(result.answer).toBeDefined();
    expect(result.metadata.answerMode).toBe('CONVERSATIONAL');
  });
});
