const fs = require('fs');
const path = require('path');
const { prisma, cleanDatabase } = require('./setup');
const { documentProcessingService } = require('../src/modules/documents/services/document-processing.service');
const { deadLetterQueueService } = require('../src/workers/dlq.service');

describe('Phase 10.4 — Worker Reliability & Dead-Letter Queue', () => {
  let org, user, doc;
  const tempFiles = [];

  beforeEach(async () => {
    await cleanDatabase();

    org = await prisma.organization.create({ data: { name: 'Worker Org' } });
    user = await prisma.user.create({ data: { email: 'worker@acme.com', passwordHash: 'h', name: 'W' } });

    const filePath = path.resolve(`./uploads/test_worker_idemp_${Date.now()}.txt`);
    tempFiles.push(filePath);
    fs.writeFileSync(filePath, 'Worker reliability test content. Sentence A. Sentence B.');

    doc = await prisma.document.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        name: 'test_worker.txt',
        filePath,
        fileSize: fs.statSync(filePath).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });
  });

  afterAll(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    }
  });

  it('should guarantee worker idempotency by replacing chunks cleanly on reprocessing', async () => {
    // 1st processing run
    await documentProcessingService.processDocument(doc.id, org.id);
    const countAfterRun1 = await prisma.documentChunk.count({ where: { documentId: doc.id } });
    expect(countAfterRun1).toBeGreaterThan(0);

    // 2nd processing run (simulating job retry)
    await documentProcessingService.processDocument(doc.id, org.id);
    const countAfterRun2 = await prisma.documentChunk.count({ where: { documentId: doc.id } });

    // Must match count exactly, no duplicate chunks created!
    expect(countAfterRun2).toBe(countAfterRun1);
  });

  it('should capture permanently failed jobs in Dead-Letter Queue with scrubbed content', () => {
    const dlqEntry = deadLetterQueueService.captureFailure({
      queueName: 'document',
      jobId: 'job-999',
      organizationId: org.id,
      data: {
        documentId: doc.id,
        secretApiKey: 'sk-123456789012345678901234',
      },
      error: new Error('Extraction failed for token sk-123456789012345678901234'),
      attempts: 3,
    });

    expect(dlqEntry.jobId).toBe('job-999');
    expect(dlqEntry.error).toContain('[API_KEY_REDACTED]');

    const list = deadLetterQueueService.list({ queueName: 'document' });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].jobId).toBe('job-999');
  });
});
