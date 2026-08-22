const { prisma } = require('../../config/database');
const { Prisma } = require('@prisma/client');

// ============================================================
// Search Repository
// ============================================================
// Performs PostgreSQL + pgvector similarity search strictly scoped
// to the authenticated organization (tenant isolation).

class SearchRepository {
  /**
   * Perform vector similarity search on document chunks.
   * Uses cosine distance (`<=>` operator) and calculates cosine similarity (`1 - distance`).
   *
   * @param {object} params
   * @param {string} params.organizationId - Validated tenant UUID
   * @param {number[]} params.queryVector - Float vector of query embedding
   * @param {number} params.topK - Maximum number of chunks to return
   * @param {number} params.threshold - Minimum cosine similarity threshold [0.0, 1.0]
   * @param {string} [params.documentId] - Optional document UUID filter
   * @returns {Promise<Array<{ chunkId: string, documentId: string, content: string, score: number, pageNumber: number | null, chunkIndex: number, metadata: object | null }>>}
   */
  async findSimilarChunks({
    organizationId,
    queryVector,
    topK,
    threshold,
    documentId = null,
  }) {
    const vectorStr = `[${queryVector.join(',')}]`;

    const documentCondition = documentId
      ? Prisma.sql`AND d.id = ${documentId}::uuid`
      : Prisma.empty;

    const rows = await prisma.$queryRaw`
      SELECT
        dc.id AS "chunkId",
        dc.document_id AS "documentId",
        dc.content,
        dc.chunk_index AS "chunkIndex",
        dc.page_number AS "pageNumber",
        dc.metadata,
        (1 - (dc.embedding <=> ${vectorStr}::vector)) AS score
      FROM document_chunks dc
      INNER JOIN documents d ON dc.document_id = d.id
      WHERE d.organization_id = ${organizationId}::uuid
        AND d.status = 'READY'::"DocumentStatus"
        AND dc.embedding IS NOT NULL
        ${documentCondition}
        AND (1 - (dc.embedding <=> ${vectorStr}::vector)) >= ${threshold}
      ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
      LIMIT ${topK};
    `;

    return rows;
  }
}

const searchRepository = new SearchRepository();

module.exports = {
  SearchRepository,
  searchRepository,
};
