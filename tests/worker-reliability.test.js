const { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } = require('../src/config/queue.config');
const { closeWorkers, startWorkers, workers } = require('../src/workers/index');
const { documentChunkRepository } = require('../src/modules/documents/repositories/document-chunk.repository');
const { cleanDatabase, disconnectDatabase, prisma } = require('./setup');
const crypto = require('crypto');

describe('Phase 7.5 — Worker Reliability & BullMQ', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await closeWorkers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe('Queue Retry & Backoff Configuration', () => {
    it('should have exponential backoff and retry attempts configured in default job options', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(3);
      expect(DEFAULT_JOB_OPTIONS.backoff).toBeDefined();
      expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
      expect(DEFAULT_JOB_OPTIONS.backoff.delay).toBeGreaterThanOrEqual(1000);
      expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toBeDefined();
      expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBeDefined();
    });

    it('should define distinct queue names for audit, notification, and document queues', () => {
      expect(QUEUE_NAMES.AUDIT).toBe('audit');
      expect(QUEUE_NAMES.NOTIFICATION).toBe('notification');
      expect(QUEUE_NAMES.DOCUMENT).toBe('document');
    });
  });

  describe('Document Processing Idempotency', () => {
    it('should overwrite chunks idempotently when re-processing the same document', async () => {
      // 1. Setup user & organization & document
      const user = await prisma.user.create({
        data: {
          email: `worker_test_${Date.now()}@example.com`,
          passwordHash: 'hash',
          name: 'Worker Tester',
        },
      });

      const org = await prisma.organization.create({
        data: { name: 'Worker Org' },
      });

      const doc = await prisma.document.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          name: 'test.pdf',
          filePath: '/tmp/test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          status: 'PROCESSING',
        },
      });

      // Dummy 1536-dim embedding vector
      const dummyEmbedding = Array.from({ length: 1536 }, () => 0.01);

      const chunkBatch1 = [
        { chunkIndex: 0, content: 'Version 1 chunk 0', pageNumber: 1, embedding: dummyEmbedding },
        { chunkIndex: 1, content: 'Version 1 chunk 1', pageNumber: 1, embedding: dummyEmbedding },
      ];

      // First run: save chunks
      const result1 = await documentChunkRepository.saveChunksWithEmbeddings(doc.id, chunkBatch1);
      expect(result1.insertedCount).toBe(2);

      let count = await documentChunkRepository.countByDocumentId(doc.id);
      expect(count).toBe(2);

      // Second run (re-processing / retry): new chunk batch
      const chunkBatch2 = [
        { chunkIndex: 0, content: 'Version 2 chunk 0 (updated)', pageNumber: 1, embedding: dummyEmbedding },
        { chunkIndex: 1, content: 'Version 2 chunk 1 (updated)', pageNumber: 1, embedding: dummyEmbedding },
        { chunkIndex: 2, content: 'Version 2 chunk 2 (new)', pageNumber: 2, embedding: dummyEmbedding },
      ];

      const result2 = await documentChunkRepository.saveChunksWithEmbeddings(doc.id, chunkBatch2);
      expect(result2.insertedCount).toBe(3);

      // Total count must be 3, NOT 2 + 3 = 5 (no duplicates on retry)
      count = await documentChunkRepository.countByDocumentId(doc.id);
      expect(count).toBe(3);

      const storedChunks = await documentChunkRepository.findByDocumentId(doc.id);
      expect(storedChunks.map((c) => c.content)).toEqual([
        'Version 2 chunk 0 (updated)',
        'Version 2 chunk 1 (updated)',
        'Version 2 chunk 2 (new)',
      ]);
    });
  });

  describe('Graceful Worker Shutdown', () => {
    it('should close all active workers cleanly without errors', async () => {
      await closeWorkers();
      expect(workers.length).toBe(0);
    });
  });
});
