const { prisma } = require('../../../config/database');

// ============================================================
// Document Repository
// ============================================================
// Data access layer for Document records with tenant isolation.

class DocumentRepository {
  /**
   * Find document by ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return prisma.document.findUnique({
      where: { id },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  }

  /**
   * Find document by ID and organization ID (tenant-scoped).
   * @param {string} id
   * @param {string} organizationId
   * @returns {Promise<object|null>}
   */
  async findByIdAndOrg(id, organizationId) {
    return prisma.document.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  }

  /**
   * Create a new document record.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    return prisma.document.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        name: data.name,
        filePath: data.filePath,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        status: data.status || 'UPLOADED',
        pageCount: data.pageCount || null,
        metadata: data.metadata || {},
      },
    });
  }

  /**
   * Update document status with optional error message or page count.
   * @param {string} id
   * @param {string} status
   * @param {object} [extra]
   * @returns {Promise<object>}
   */
  async updateStatus(id, status, extra = {}) {
    const updateData = { status };

    if (extra.errorMessage !== undefined) {
      updateData.errorMessage = extra.errorMessage;
    }
    if (extra.pageCount !== undefined) {
      updateData.pageCount = extra.pageCount;
    }
    if (extra.processingAttempts !== undefined) {
      updateData.processingAttempts = extra.processingAttempts;
    }
    if (extra.metadata !== undefined) {
      updateData.metadata = extra.metadata;
    }

    return prisma.document.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Increment processing attempts counter.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async incrementAttempts(id) {
    return prisma.document.update({
      where: { id },
      data: {
        processingAttempts: {
          increment: 1,
        },
      },
    });
  }

  /**
   * List documents for an organization.
   * @param {string} organizationId
   * @param {object} [options]
   * @returns {Promise<object[]>}
   */
  async listByOrg(organizationId, options = {}) {
    const { skip = 0, take = 50, status } = options;

    const where = { organizationId };
    if (status) {
      where.status = status;
    }

    return prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  }

  /**
   * Delete a document by ID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async delete(id) {
    return prisma.document.delete({
      where: { id },
    });
  }
}

const documentRepository = new DocumentRepository();

module.exports = { DocumentRepository, documentRepository };
