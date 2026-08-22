const path = require('path');
const fs = require('fs');
const { documentRepository } = require('./repositories/document.repository');
const { enqueueDocumentJob } = require('../../services/queue.service');
const { parsePaginationParams, buildOffsetPagination } = require('../../utils/pagination');
const { NotFoundError, BadRequestError, ConflictError } = require('../../utils/errors');
const { logger } = require('../../config/logger');

// ============================================================
// Document Service (Web / Business Layer)
// ============================================================

class DocumentService {
  constructor(options = {}) {
    this.docRepo = options.documentRepository || documentRepository;
  }

  /**
   * Save uploaded document record.
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @param {Express.Multer.File} params.file
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async upload({ organizationId, userId, file, metadata = {} }) {
    if (!file) {
      throw new BadRequestError('No file was uploaded', 'FILE_REQUIRED');
    }

    const document = await this.docRepo.create({
      organizationId,
      userId,
      name: file.originalname || 'document.pdf',
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype || 'application/pdf',
      status: 'UPLOADED',
      metadata,
    });

    logger.info({ documentId: document.id, organizationId }, 'Document uploaded successfully');
    return document;
  }

  /**
   * Enqueue a document for asynchronous processing.
   * @param {string} documentId
   * @param {string} organizationId
   * @returns {Promise<{ documentId: string, status: string, jobId: string|null }>}
   */
  async process(documentId, organizationId) {
    const document = await this.docRepo.findByIdAndOrg(documentId, organizationId);
    if (!document) {
      throw new NotFoundError('Document not found in this organization', 'DOCUMENT_NOT_FOUND');
    }

    // Duplicate processing check: Prevent re-queueing if currently QUEUED or PROCESSING
    if (document.status === 'QUEUED' || document.status === 'PROCESSING') {
      throw new ConflictError(
        `Document is already in ${document.status} status`,
        'DOCUMENT_ALREADY_PROCESSING'
      );
    }

    // Transition status to QUEUED
    await this.docRepo.updateStatus(documentId, 'QUEUED', { errorMessage: null });

    // Enqueue BullMQ job
    const jobId = await enqueueDocumentJob({
      documentId,
      organizationId,
      action: 'process',
    });

    logger.info({ documentId, organizationId, jobId }, 'Document queued for background processing');

    return {
      documentId,
      status: 'QUEUED',
      jobId,
    };
  }

  /**
   * Retrieve document by ID within tenant organization.
   * @param {string} documentId
   * @param {string} organizationId
   * @returns {Promise<object>}
   */
  async getById(documentId, organizationId) {
    const document = await this.docRepo.findByIdAndOrg(documentId, organizationId);
    if (!document) {
      throw new NotFoundError('Document not found in this organization', 'DOCUMENT_NOT_FOUND');
    }

    return {
      id: document.id,
      organizationId: document.organizationId,
      userId: document.userId,
      name: document.name,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      status: document.status,
      errorMessage: document.errorMessage,
      processingAttempts: document.processingAttempts,
      pageCount: document.pageCount,
      chunkCount: document._count?.chunks || 0,
      metadata: document.metadata,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  /**
   * List documents in an organization with pagination.
   * @param {string} organizationId
   * @param {object} query
   * @returns {Promise<object>}
   */
  async list(organizationId, query = {}) {
    const { page, limit, skip } = parsePaginationParams(query);
    const { status } = query;

    const [documents, total] = await Promise.all([
      this.docRepo.listByOrg(organizationId, { skip, take: limit, status }),
      this.docRepo.listByOrg(organizationId, { status }).then((docs) => docs.length),
    ]);

    const formattedDocs = documents.map((doc) => ({
      id: doc.id,
      organizationId: doc.organizationId,
      name: doc.name,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      status: doc.status,
      errorMessage: doc.errorMessage,
      pageCount: doc.pageCount,
      chunkCount: doc._count?.chunks || 0,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    return {
      documents: formattedDocs,
      pagination: buildOffsetPagination({ total, page, limit }),
    };
  }
}

const documentService = new DocumentService();

module.exports = { DocumentService, documentService };
