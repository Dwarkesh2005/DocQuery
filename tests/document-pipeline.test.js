const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { prisma } = require('../src/config/database');
const { documentProcessingService } = require('../src/modules/documents/services/document-processing.service');
const { documentChunkRepository } = require('../src/modules/documents/repositories/document-chunk.repository');

function createPdfFile(filePath, texts = ['Phase 3 test PDF content page 1', 'Page 2 content details']) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    texts.forEach((text, i) => {
      if (i > 0) doc.addPage();
      doc.fontSize(12).text(text, 50, 50);
    });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

describe('Document Processing Pipeline (Service & pgvector Integration)', () => {
  let user;
  let orgA;
  let orgB;
  const tempFiles = [];

  beforeAll(async () => {
    // Create test user and two test organizations
    user = await prisma.user.create({
      data: {
        email: `pipeline-user-${Date.now()}@example.com`,
        name: 'Pipeline Tester',
        passwordHash: 'hash',
      },
    });

    orgA = await prisma.organization.create({
      data: {
        name: 'Org Pipeline A',
        memberships: {
          create: { userId: user.id, role: 'OWNER' },
        },
      },
    });

    orgB = await prisma.organization.create({
      data: {
        name: 'Org Pipeline B',
        memberships: {
          create: { userId: user.id, role: 'OWNER' },
        },
      },
    });
  });

  afterAll(async () => {
    // Cleanup temporary files
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }

    // Cleanup database
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: user.id },
    });
    await prisma.$disconnect();
  });

  it('should process a valid PDF end-to-end, store pgvector chunks, and set status to READY', async () => {
    const tmpPdfPath = path.resolve(`./uploads/test_${Date.now()}_valid.pdf`);
    tempFiles.push(tmpPdfPath);
    await createPdfFile(tmpPdfPath, [
      'Document Intelligence with DocQuery Phase 3. Vector embeddings stored in PostgreSQL.',
      'Second page discusses multi-tenancy and background worker execution.',
    ]);

    const doc = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: user.id,
        name: 'sample.pdf',
        filePath: tmpPdfPath,
        fileSize: fs.statSync(tmpPdfPath).size,
        mimeType: 'application/pdf',
        status: 'QUEUED',
      },
    });

    const result = await documentProcessingService.processDocument(doc.id, orgA.id);
    expect(result.success).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(0);

    // Verify document status in DB
    const updatedDoc = await prisma.document.findUnique({
      where: { id: doc.id },
    });
    expect(updatedDoc.status).toBe('READY');
    expect(updatedDoc.pageCount).toBe(2);
    expect(updatedDoc.errorMessage).toBeNull();

    // Verify chunks and pgvector embeddings in database
    const chunks = await documentChunkRepository.findByDocumentId(doc.id);
    expect(chunks.length).toBe(result.chunkCount);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content.length).toBeGreaterThan(0);

    // Verify vector column has data
    const rawVector = await prisma.$queryRawUnsafe(
      'SELECT embedding::text FROM document_chunks WHERE document_id = $1::uuid LIMIT 1',
      doc.id
    );
    expect(rawVector[0].embedding).toContain('[');
  });

  it('should be idempotent: reprocessing a document should not produce duplicate chunks', async () => {
    const tmpTxtPath = path.resolve(`./uploads/test_${Date.now()}_idempotent.txt`);
    tempFiles.push(tmpTxtPath);
    fs.writeFileSync(tmpTxtPath, 'Idempotency test content that should be chunked and embedded cleanly.');

    const doc = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: user.id,
        name: 'idempotent.txt',
        filePath: tmpTxtPath,
        fileSize: fs.statSync(tmpTxtPath).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });

    // Run 1
    await documentProcessingService.processDocument(doc.id, orgA.id);
    const count1 = await documentChunkRepository.countByDocumentId(doc.id);

    // Run 2 (Reprocess / retry)
    await documentProcessingService.processDocument(doc.id, orgA.id);
    const count2 = await documentChunkRepository.countByDocumentId(doc.id);

    // Chunk counts must match without duplication
    expect(count2).toBe(count1);
  });

  it('should enforce tenant isolation: processing with mismatched org ID must fail', async () => {
    const tmpTxtPath = path.resolve(`./uploads/test_${Date.now()}_tenant.txt`);
    tempFiles.push(tmpTxtPath);
    fs.writeFileSync(tmpTxtPath, 'Tenant test file content.');

    const doc = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: user.id,
        name: 'tenant.txt',
        filePath: tmpTxtPath,
        fileSize: fs.statSync(tmpTxtPath).size,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });

    // Attempt to process orgA doc using orgB's context
    await expect(
      documentProcessingService.processDocument(doc.id, orgB.id)
    ).rejects.toThrow(/Document does not belong to the specified organization/);

    // Status should not be updated to READY
    const checkedDoc = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(checkedDoc.status).not.toBe('READY');
  });

  it('should mark corrupted or empty document as FAILED with error message', async () => {
    const tmpEmptyPath = path.resolve(`./uploads/test_${Date.now()}_empty.txt`);
    tempFiles.push(tmpEmptyPath);
    fs.writeFileSync(tmpEmptyPath, '   \n\n\t   ');

    const doc = await prisma.document.create({
      data: {
        organizationId: orgA.id,
        userId: user.id,
        name: 'empty.txt',
        filePath: tmpEmptyPath,
        fileSize: 10,
        mimeType: 'text/plain',
        status: 'QUEUED',
      },
    });

    await expect(
      documentProcessingService.processDocument(doc.id, orgA.id)
    ).rejects.toThrow();

    const failedDoc = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(failedDoc.status).toBe('FAILED');
    expect(failedDoc.errorMessage).toBeDefined();
    expect(failedDoc.errorMessage.length).toBeGreaterThan(0);
  });
});
