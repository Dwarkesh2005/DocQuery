const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { prisma } = require('../src/config/database');
const { generateAccessToken } = require('../src/utils/jwt');
const { documentProcessingService } = require('../src/modules/documents/services/document-processing.service');
const { NO_CONTEXT_ANSWER } = require('../src/modules/query/query.service');

// ============================================================
// Phase 6 Tests: Conversations & Query History
// ============================================================

describe('Conversations & Query History API (/api/v1/conversations)', () => {
  let userA1; // Org A, Owner
  let userA2; // Org A, Member
  let userB;  // Org B, Owner
  let orgA;
  let orgB;
  let tokenA1;
  let tokenA2;
  let tokenB;
  let docA;
  let docB;
  const tempFiles = [];

  beforeAll(async () => {
    // 1. Create User A1 (Org A Owner)
    userA1 = await prisma.user.create({
      data: {
        email: `conv-usera1-${Date.now()}@example.com`,
        name: 'User A1',
        passwordHash: 'hash',
      },
    });

    orgA = await prisma.organization.create({
      data: {
        name: 'Organization Conv A',
        memberships: {
          create: { userId: userA1.id, role: 'OWNER' },
        },
      },
    });
    tokenA1 = generateAccessToken(userA1.id);

    // 2. Create User A2 (Org A Member)
    userA2 = await prisma.user.create({
      data: {
        email: `conv-usera2-${Date.now()}@example.com`,
        name: 'User A2',
        passwordHash: 'hash',
      },
    });
    await prisma.organizationMember.create({
      data: {
        userId: userA2.id,
        organizationId: orgA.id,
        role: 'MEMBER',
      },
    });
    tokenA2 = generateAccessToken(userA2.id);

    // 3. Create User B (Org B Owner)
    userB = await prisma.user.create({
      data: {
        email: `conv-userb-${Date.now()}@example.com`,
        name: 'User B',
        passwordHash: 'hash',
      },
    });

    orgB = await prisma.organization.create({
      data: {
        name: 'Organization Conv B',
        memberships: {
          create: { userId: userB.id, role: 'OWNER' },
        },
      },
    });
    tokenB = generateAccessToken(userB.id);

    // 4. Create and index documents for Org A & Org B
    // Doc A: Leave and Benefits Policy
    const fileA = path.resolve(`./uploads/test_conv_leave_${Date.now()}.txt`);
    tempFiles.push(fileA);
    fs.writeFileSync(
      fileA,
      'DocQuery Comprehensive Leave Policy: All regular full-time employees are entitled to 20 days of annual leave. ' +
      'In addition, employees receive 10 days of paid sick leave per year. ' +
      'Contractors and interns receive prorated leave based on project tenure.'
    );

    docA = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: userA1.id,
        name: 'leave_policy.txt',
        filePath: fileA,
        fileSize: fs.statSync(fileA).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(docA.id, orgA.id);

    // Doc B: Organization B Confidential Strategy
    const fileB = path.resolve(`./uploads/test_conv_orgb_${Date.now()}.txt`);
    tempFiles.push(fileB);
    fs.writeFileSync(
      fileB,
      'Organization B Confidential Product Roadmap: Project Apollo launches in Q4 with dedicated enterprise security features.'
    );

    docB = await prisma.document.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        name: 'apollo_roadmap.txt',
        filePath: fileB,
        fileSize: fs.statSync(fileB).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
    await documentProcessingService.processDocument(docB.id, orgB.id);
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
      where: { id: { in: [userA1.id, userA2.id, userB.id] } },
    });
    await prisma.$disconnect();
  });

  // ══════════════════════════════════════════════════════════
  // A. Conversation Creation
  // ══════════════════════════════════════════════════════════

  describe('POST /api/v1/conversations (Creation)', () => {
    it('should create a conversation with default title', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation).toBeDefined();
      expect(res.body.data.conversation.id).toBeDefined();
      expect(res.body.data.conversation.title).toBe('New Conversation');
      expect(res.body.data.conversation.organizationId).toBe(orgA.id);
      expect(res.body.data.conversation.userId).toBe(userA1.id);
    });

    it('should create a conversation with custom title', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'Leave Policy Inquiries' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation.title).toBe('Leave Policy Inquiries');
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .send({ title: 'Unauthorized' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing X-Organization-Id header with 400', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .send({ title: 'Missing Org' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthorized organization access with 403', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgB.id) // User A1 is not member of Org B
        .send({ title: 'Foreign Org' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  // B. Conversation Listing & Isolation
  // ══════════════════════════════════════════════════════════

  describe('GET /api/v1/conversations (Listing & Isolation)', () => {
    let convA1;
    let convA2;
    let convB;

    beforeAll(async () => {
      // User A1 creates conversation
      const resA1 = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'User A1 Conv' });
      convA1 = resA1.body.data.conversation;

      // User A2 (same org) creates conversation
      const resA2 = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'User A2 Conv' });
      convA2 = resA2.body.data.conversation;

      // User B (Org B) creates conversation
      const resB = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id)
        .send({ title: 'User B Conv' });
      convB = resB.body.data.conversation;
    });

    it('should list conversations belonging to authenticated user with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.conversations)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();

      const ids = res.body.data.conversations.map((c) => c.id);
      expect(ids).toContain(convA1.id);
      // User A1 must NOT see User A2's conversation (User ownership)
      expect(ids).not.toContain(convA2.id);
      // User A1 must NOT see Org B's conversation (Tenant isolation)
      expect(ids).not.toContain(convB.id);
    });

    it('should isolate conversations between users in the same organization', async () => {
      const res = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      const ids = res.body.data.conversations.map((c) => c.id);
      expect(ids).toContain(convA2.id);
      expect(ids).not.toContain(convA1.id);
    });
  });

  // ══════════════════════════════════════════════════════════
  // C. Conversation Get, Update & Delete
  // ══════════════════════════════════════════════════════════

  describe('Conversation Single Item Operations (GET, PATCH, DELETE)', () => {
    let testConv;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'Item Test Conversation' });
      testConv = res.body.data.conversation;
    });

    it('should get conversation details by ID for owner', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation.id).toBe(testConv.id);
      expect(res.body.data.conversation.title).toBe('Item Test Conversation');
      expect(res.body.data.conversation.messageCount).toBe(0);
    });

    it('should return 404 when non-owner in same organization attempts GET', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should return 404 when user from another organization attempts GET', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should update conversation title for owner', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation.title).toBe('Updated Title');
    });

    it('should reject empty title on update with 422', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when non-owner attempts to update', async () => {
      const res = await request(app)
        .patch(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(404);
    });

    it('should delete conversation for owner', async () => {
      const res = await request(app)
        .delete(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);

      // Verify it no longer exists
      const checkRes = await request(app)
        .get(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);
      expect(checkRes.status).toBe(404);
    });

    it('should return 404 when non-owner attempts to delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/conversations/${testConv.id}`)
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════
  // D. Send Message & Conversational RAG
  // ══════════════════════════════════════════════════════════

  describe('POST /api/v1/conversations/:id/messages (Conversational RAG)', () => {
    let ragConv;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'New Conversation' });
      ragConv = res.body.data.conversation;
    });

    it('should send a message, execute RAG, and persist user & assistant messages with sources', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'What is the leave policy for employees?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { conversation, userMessage, assistantMessage, citations, sources } = res.body.data;

      // Conversation title auto-updated from default
      expect(conversation.id).toBe(ragConv.id);
      expect(conversation.title).toContain('leave policy');

      // User message
      expect(userMessage.id).toBeDefined();
      expect(userMessage.role).toBe('USER');
      expect(userMessage.content).toBe('What is the leave policy for employees?');

      // Assistant message
      expect(assistantMessage.id).toBeDefined();
      expect(assistantMessage.role).toBe('ASSISTANT');
      expect(typeof assistantMessage.content).toBe('string');
      expect(assistantMessage.content.length).toBeGreaterThan(0);

      // Sources & Citations
      expect(Array.isArray(citations)).toBe(true);
      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].documentId).toBe(docA.id);

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources[0].messageId).toBe(assistantMessage.id);
      expect(sources[0].documentId).toBe(docA.id);
    });

    it('should maintain multi-turn conversational context in follow-up message', async () => {
      // Turn 1: Initial query
      await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'What is the annual leave policy?' });

      // Turn 2: Follow-up query depending on context
      const res2 = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'What about sick leave?' });

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(res2.body.data.citations.length).toBeGreaterThan(0);
      expect(res2.body.data.citations[0].documentId).toBe(docA.id);
    });

    it('should reject empty or whitespace message content with 422', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when non-owner attempts to send message', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'Unauthorized message' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should return 404 when cross-tenant user attempts to send message', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Organization-Id', orgB.id)
        .send({ content: 'Cross-tenant message' });

      expect(res.status).toBe(404);
    });

    it('should never expose Org B document contents in Org A conversation', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'Project Apollo roadmap Q4 enterprise security' });

      expect(res.status).toBe(200);
      for (const source of res.body.data.sources) {
        expect(source.documentId).not.toBe(docB.id);
        expect(source.content).not.toContain('Project Apollo');
      }
    });

    it('should return canned response with empty sources for queries with no matching context', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${ragConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({
          content: 'quantum supercomputing astrophysics gravitational waves',
          threshold: 0.9999,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assistantMessage.content).toBe(NO_CONTEXT_ANSWER);
      expect(res.body.data.sources).toEqual([]);
      expect(res.body.data.citations).toEqual([]);
    });
  });

  // ══════════════════════════════════════════════════════════
  // E. Message History & Pagination
  // ══════════════════════════════════════════════════════════

  describe('GET /api/v1/conversations/:id/messages (History & Pagination)', () => {
    let historyConv;

    beforeAll(async () => {
      const convRes = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'Pagination History Test' });
      historyConv = convRes.body.data.conversation;

      // Send 3 turns (6 messages total: 3 user, 3 assistant)
      await request(app)
        .post(`/api/v1/conversations/${historyConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'Question 1: What is annual leave?' });

      await request(app)
        .post(`/api/v1/conversations/${historyConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'Question 2: What is sick leave?' });

      await request(app)
        .post(`/api/v1/conversations/${historyConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'Question 3: What about contractors?' });
    });

    it('should list messages in chronological order with embedded citation sources', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${historyConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBe(6);

      const messages = res.body.data.data;
      expect(messages[0].role).toBe('USER');
      expect(messages[0].content).toContain('Question 1');
      expect(messages[1].role).toBe('ASSISTANT');
      expect(Array.isArray(messages[1].sources)).toBe(true);
      expect(messages[1].sources.length).toBeGreaterThan(0);
      expect(messages[1].sources[0].documentId).toBe(docA.id);
    });

    it('should support offset-based pagination', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${historyConv.id}/messages?page=1&limit=2`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(6);
      expect(res.body.data.pagination.totalPages).toBe(3);
      expect(res.body.data.pagination.hasNextPage).toBe(true);
    });

    it('should support cursor-based pagination', async () => {
      // Fetch first page with limit 2
      const page1Res = await request(app)
        .get(`/api/v1/conversations/${historyConv.id}/messages?limit=2`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.data.data.length).toBe(2);

      // Verify next cursor
      const nextCursor = page1Res.body.data.pagination.nextCursor;
      expect(nextCursor).toBeDefined();

      if (nextCursor) {
        const page2Res = await request(app)
          .get(`/api/v1/conversations/${historyConv.id}/messages?limit=2&cursor=${nextCursor}`)
          .set('Authorization', `Bearer ${tokenA1}`)
          .set('X-Organization-Id', orgA.id);

        expect(page2Res.status).toBe(200);
        expect(page2Res.body.data.data.length).toBe(2);
        expect(page2Res.body.data.data[0].id).not.toBe(page1Res.body.data.data[0].id);
      }
    });

    it('should return 404 for non-owner attempting to list messages', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${historyConv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA2}`)
        .set('X-Organization-Id', orgA.id);

      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════
  // F. Cascading Deletion
  // ══════════════════════════════════════════════════════════

  describe('Cascading Deletes', () => {
    it('should delete all messages and message sources when a conversation is deleted', async () => {
      // 1. Create a conversation
      const convRes = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ title: 'Cascade Delete Test' });
      const conv = convRes.body.data.conversation;

      // 2. Send a message to generate user message, assistant message, and sources
      const msgRes = await request(app)
        .post(`/api/v1/conversations/${conv.id}/messages`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id)
        .send({ content: 'What is the leave policy?' });

      const assistantMsgId = msgRes.body.data.assistantMessage.id;

      // Verify messages and sources exist in database
      const msgCountBefore = await prisma.message.count({ where: { conversationId: conv.id } });
      const sourceCountBefore = await prisma.messageSource.count({ where: { messageId: assistantMsgId } });
      expect(msgCountBefore).toBe(2);
      expect(sourceCountBefore).toBeGreaterThan(0);

      // 3. Delete the conversation
      const delRes = await request(app)
        .delete(`/api/v1/conversations/${conv.id}`)
        .set('Authorization', `Bearer ${tokenA1}`)
        .set('X-Organization-Id', orgA.id);

      expect(delRes.status).toBe(200);

      // 4. Verify messages and sources are deleted
      const msgCountAfter = await prisma.message.count({ where: { conversationId: conv.id } });
      const sourceCountAfter = await prisma.messageSource.count({ where: { messageId: assistantMsgId } });
      expect(msgCountAfter).toBe(0);
      expect(sourceCountAfter).toBe(0);

      // 5. Verify the underlying document and chunks were NOT deleted
      const docStillExists = await prisma.document.findUnique({ where: { id: docA.id } });
      expect(docStillExists).not.toBeNull();
    });
  });
});
