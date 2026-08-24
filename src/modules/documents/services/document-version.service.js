const crypto = require('crypto');
const fs = require('fs');
const { prisma } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// ============================================================
// Document Version & Checksum Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

class DocumentVersionService {
  /**
   * Calculate SHA-256 hash of a file or buffer.
   * @param {string|Buffer} input - File path or buffer
   * @returns {string} Hexadecimal SHA-256 hash
   */
  calculateHash(input) {
    if (Buffer.isBuffer(input)) {
      return crypto.createHash('sha256').update(input).digest('hex');
    }
    if (typeof input === 'string') {
      if (fs.existsSync(input)) {
        const fileBuffer = fs.readFileSync(input);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
      }
      return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
    }
    throw new Error('Invalid input for hash calculation');
  }

  /**
   * Check if a duplicate document with identical content hash exists within an organization.
   * @param {string} organizationId
   * @param {string} contentHash
   * @returns {Promise<object|null>}
   */
  async findDuplicate(organizationId, contentHash) {
    return prisma.document.findFirst({
      where: {
        organizationId,
        contentHash,
        status: 'READY',
      },
      include: {
        _count: { select: { chunks: true } },
      },
    });
  }

  /**
   * Create a new revision/version entry for a document.
   */
  async createVersion({
    documentId,
    contentHash,
    filePath,
    fileSize,
    summary = null,
    metadata = {},
    createdBy,
  }) {
    // Find latest version number
    const latest = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const nextVersion = (latest?.versionNumber || 0) + 1;

    return prisma.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextVersion,
        contentHash,
        filePath,
        fileSize,
        summary,
        metadata,
        createdBy,
      },
    });
  }

  /**
   * List all versions of a document.
   */
  async listVersions(documentId) {
    return prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { versionNumber: 'desc' },
    });
  }
}

const documentVersionService = new DocumentVersionService();

module.exports = {
  DocumentVersionService,
  documentVersionService,
};
