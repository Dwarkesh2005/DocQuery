const fs = require('fs');
const { documentRepository } = require('../repositories/document.repository');
const { documentChunkRepository } = require('../repositories/document-chunk.repository');
const { extractorFactory } = require('../extractors/extractor.factory');
const { documentCleanerService } = require('./document-cleaner.service');
const { chunkerService } = require('./chunker.service');
const { embeddingService } = require('./embedding.service');
const { logger } = require('../../../config/logger');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../../../utils/errors');

// ============================================================
// Document Processing Service (Orchestrator)
// ============================================================
// Orchestrates the end-to-end document processing pipeline:
// Tenant Isolation → Extractor → Cleaner → Chunker → Embeddings → pgvector Storage → READY

class DocumentProcessingService {
  constructor(options = {}) {
    this.docRepo = options.documentRepository || documentRepository;
    this.chunkRepo = options.documentChunkRepository || documentChunkRepository;
    this.extractors = options.extractorFactory || extractorFactory;
    this.cleaner = options.documentCleanerService || documentCleanerService;
    this.chunker = options.chunkerService || chunkerService;
    this.embedder = options.embeddingService || embeddingService;
  }

  /**
   * Process an uploaded document asynchronously through the pipeline.
   * @param {string} documentId
   * @param {string} organizationId
   * @returns {Promise<{ success: boolean, documentId: string, chunkCount: number }>}
   */
  async processDocument(documentId, organizationId) {
    if (!documentId || !organizationId) {
      throw new BadRequestError('documentId and organizationId are required for document processing');
    }

    logger.info({ documentId, organizationId }, 'Document processing job received');

    // 1. Fetch document from database
    const document = await this.docRepo.findById(documentId);
    if (!document) {
      logger.error({ documentId }, 'Document processing failed: document not found');
      throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
    }

    // 2. Enforce strict tenant isolation
    if (document.organizationId !== organizationId) {
      logger.error(
        { documentId, docOrg: document.organizationId, reqOrg: organizationId },
        'Tenant isolation violation during document processing'
      );
      throw new ForbiddenError(
        'Document does not belong to the specified organization',
        'TENANT_ISOLATION_VIOLATION'
      );
    }

    // 3. Mark document as PROCESSING and increment processing attempts
    await this.docRepo.incrementAttempts(documentId);
    await this.docRepo.updateStatus(documentId, 'PROCESSING', {
      errorMessage: null,
    });

    try {
      // 4. Verify file exists on storage
      if (!fs.existsSync(document.filePath)) {
        throw new NotFoundError('Document file not found on disk storage', 'FILE_NOT_FOUND');
      }

      // 5. Extract text using format-specific strategy
      logger.info({ documentId, mimeType: document.mimeType }, 'Extracting document text');
      const extractor = this.extractors.getExtractor(document.mimeType, document.name);
      const extractionResult = await extractor.extract(document.filePath);

      if (!extractionResult.text || extractionResult.text.trim().length === 0) {
        throw new Error('Document contains no extractable text content');
      }

      logger.info(
        { documentId, pageCount: extractionResult.pageCount, rawTextLength: extractionResult.text.length },
        'Text extraction completed'
      );

      // 6. Clean extracted text
      logger.info({ documentId }, 'Cleaning document text');
      const cleanedText = this.cleaner.cleanText(extractionResult.text);
      const cleanedPages = this.cleaner.cleanPages(extractionResult.pages || []);

      // 7. Split into chunks
      logger.info({ documentId }, 'Chunking document text');
      const chunks = this.chunker.chunkDocument({
        text: cleanedText,
        pages: cleanedPages,
      });

      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Document produced 0 chunks after chunking');
      }

      logger.info({ documentId, chunkCount: chunks.length }, 'Document chunking completed');

      // 8. Generate vector embeddings for chunks
      logger.info({ documentId, chunkCount: chunks.length }, 'Generating embeddings for chunks');
      const chunkTexts = chunks.map((c) => c.content);
      const embeddings = await this.embedder.generateEmbeddings(chunkTexts);

      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count (${embeddings.length}) does not match chunk count (${chunks.length})`);
      }

      // 9. Attach embeddings to chunks
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
      }));

      // 10. Persist chunks & vector embeddings atomically into PostgreSQL / pgvector
      logger.info({ documentId, chunkCount: chunks.length }, 'Storing chunks and pgvector embeddings');
      await this.chunkRepo.saveChunksWithEmbeddings(documentId, chunksWithEmbeddings);

      // 11. Mark document as READY
      await this.docRepo.updateStatus(documentId, 'READY', {
        errorMessage: null,
        pageCount: extractionResult.pageCount || 1,
        metadata: {
          chunkCount: chunks.length,
          processedAt: new Date().toISOString(),
        },
      });

      logger.info({ documentId, chunkCount: chunks.length }, 'Document processing succeeded -> READY');

      return {
        success: true,
        documentId,
        chunkCount: chunks.length,
      };
    } catch (error) {
      // 12. Mark document as FAILED on error
      const safeErrorMessage = error.message ? error.message.slice(0, 500) : 'Unknown processing error';

      logger.error({ documentId, error: safeErrorMessage }, 'Document processing failed -> FAILED');

      await this.docRepo.updateStatus(documentId, 'FAILED', {
        errorMessage: safeErrorMessage,
      });

      throw error;
    }
  }
}

const documentProcessingService = new DocumentProcessingService();

module.exports = { DocumentProcessingService, documentProcessingService };
