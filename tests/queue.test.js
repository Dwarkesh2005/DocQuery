const { enqueueAuditEvent, enqueueNotification, enqueueDocumentJob } = require('../src/services/queue.service');

describe('Queue Service (Producer)', () => {
  it('should gracefully handle enqueue calls without crashing even if Redis is offline', async () => {
    const auditRes = await enqueueAuditEvent({
      action: 'test.action',
      userId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const notifRes = await enqueueNotification({
      type: 'test.notification',
      userId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const docRes = await enqueueDocumentJob({
      action: 'extract',
      documentId: 'doc-123',
    });

    // Either returns a jobId (string) when Redis connected or null in degraded offline mode
    expect(auditRes === null || typeof auditRes === 'string').toBe(true);
    expect(notifRes === null || typeof notifRes === 'string').toBe(true);
    expect(docRes === null || typeof docRes === 'string').toBe(true);
  });
});
