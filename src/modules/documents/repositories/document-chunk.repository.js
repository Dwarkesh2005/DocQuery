const crypto = require('crypto');
const { prisma } = require('../../../config/database');

// ============================================================
// Document Chunk Repository
// ============================================================
// Data access layer for DocumentChunk records and pgvector embeddings.
// Guarantees idempotent storage by deleting existing chunks inside a
// database transaction before writing newly generated chunks with vectors.

class DocumentChunkRepository {
  /**
   * Persist chunks and their pgvector embeddings atomically and idempotently.
   * @param {string} documentId
   * @param {Array<{ content: string, chunkIndex: number, pageNumber?: number, metadata?: object, embedding: number[] }>} chunksWithEmbeddings
   * @returns {Promise<{ insertedCount: number }>}
   */
  async saveChunksWithEmbeddings(documentId, chunksWithEmbeddings) {
    if (!documentId) {
      throw new Error('documentId is required to save chunks');
    }

    if (!Array.isArray(chunksWithEmbeddings) || chunksWithEmbeddings.length === 0) {
      return { insertedCount: 0 };
    }

    return prisma.$transaction(async (tx) => {
      // 1. Idempotency: remove any existing chunks for this document
      await tx.$executeRawUnsafe(
        'DELETE FROM document_chunks WHERE document_id = $1::uuid',
        documentId
      );

      // 2. Insert each chunk with its pgvector embedding
      for (const chunk of chunksWithEmbeddings) {
        const chunkId = crypto.randomUUID();
        const vectorStr = `[${chunk.embedding.join(',')}]`;
        const metadataStr = JSON.stringify(chunk.metadata || {});

        await tx.$executeRawUnsafe(
          `INSERT INTO document_chunks (
            id, document_id, content, chunk_index, page_number, metadata, embedding, created_at, updated_at
          ) VALUES (
            $1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7::vector, NOW(), NOW()
          )`,
          chunkId,
          documentId,
          chunk.content,
          chunk.chunkIndex,
          chunk.pageNumber || null,
          metadataStr,
          vectorStr
        );
      }

      return { insertedCount: chunksWithEmbeddings.length };
    });
  }

  /**
   * Find chunks by document ID.
   * @param {string} documentId
   * @returns {Promise<object[]>}
   */
  async findByDocumentId(documentId) {
    return prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        documentId: true,
        content: true,
        chunkIndex: true,
        pageNumber: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Count chunks for a document.
   * @param {string} documentId
   * @returns {Promise<number>}
   */
  async countByDocumentId(documentId) {
    return prisma.documentChunk.count({
      where: { documentId },
    });
  }

  /**
   * Delete all chunks for a document.
   * @param {string} documentId
   * @returns {Promise<number>}
   */
  async deleteByDocumentId(documentId) {
    const result = await prisma.documentChunk.deleteMany({
      where: { documentId },
    });
    return result.count;
  }
}

const documentChunkRepository = new DocumentChunkRepository();

module.exports = { DocumentChunkRepository, documentChunkRepository };
