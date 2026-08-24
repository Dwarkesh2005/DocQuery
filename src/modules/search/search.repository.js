const { prisma } = require('../../config/database');
const { Prisma } = require('@prisma/client');

// ============================================================
// Search Repository
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Performs PostgreSQL + pgvector similarity search strictly scoped
// to the authenticated organization and pre-filtered document permissions.

class SearchRepository {
  /**
   * Perform vector similarity search on document chunks with permission pre-filtering.
   * Uses cosine distance (`<=>` operator) and calculates cosine similarity (`1 - distance`).
   *
   * @param {object} params
   * @param {string} params.organizationId - Validated tenant UUID
   * @param {number[]} params.queryVector - Float vector of query embedding
   * @param {number} params.topK - Maximum number of chunks to return
   * @param {number} params.threshold - Minimum cosine similarity threshold [0.0, 1.0]
   * @param {string} [params.documentId] - Optional document UUID filter
   * @param {string[]} [params.allowedDocumentIds] - Optional array of authorized document UUIDs
   * @returns {Promise<Array<{ chunkId: string, documentId: string, content: string, score: number, pageNumber: number | null, chunkIndex: number, metadata: object | null }>>}
   */
  async findSimilarChunks({
    organizationId,
    queryVector,
    topK,
    threshold,
    documentId = null,
    allowedDocumentIds = null,
  }) {
    // If permission filter is empty array, user has access to 0 documents
    if (Array.isArray(allowedDocumentIds) && allowedDocumentIds.length === 0) {
      return [];
    }

    const vectorStr = `[${queryVector.join(',')}]`;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId);
    if (!isUuid) return [];

    let documentCondition = Prisma.empty;
    if (documentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
      documentCondition = Prisma.sql`AND d.id = ${documentId}::uuid`;
    } else if (Array.isArray(allowedDocumentIds) && allowedDocumentIds.length > 0) {
      documentCondition = Prisma.sql`AND d.id = ANY(${allowedDocumentIds}::uuid[])`;
    }

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

  /**
   * Perform PostgreSQL Full-Text Search (keyword search) on document chunks with permission pre-filtering.
   *
   * @param {object} params
   * @param {string} params.organizationId - Validated tenant UUID
   * @param {string} params.query - Keyword search string
   * @param {number} [params.topK=20] - Maximum chunks to return
   * @param {string} [params.documentId] - Optional document UUID filter
   * @param {string[]} [params.allowedDocumentIds] - Optional array of authorized document UUIDs
   * @returns {Promise<Array<{ chunkId: string, documentId: string, content: string, score: number, pageNumber: number | null, chunkIndex: number, metadata: object | null }>>}
   */
  async findKeywordChunks({
    organizationId,
    query,
    topK = 20,
    documentId = null,
    allowedDocumentIds = null,
  }) {
    if (!query || !query.trim()) return [];

    // If permission filter is empty array, user has access to 0 documents
    if (Array.isArray(allowedDocumentIds) && allowedDocumentIds.length === 0) {
      return [];
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId);
    if (!isUuid) return [];

    let documentCondition = Prisma.empty;
    if (documentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
      documentCondition = Prisma.sql`AND d.id = ${documentId}::uuid`;
    } else if (Array.isArray(allowedDocumentIds) && allowedDocumentIds.length > 0) {
      documentCondition = Prisma.sql`AND d.id = ANY(${allowedDocumentIds}::uuid[])`;
    }

    const rows = await prisma.$queryRaw`
      SELECT
        dc.id AS "chunkId",
        dc.document_id AS "documentId",
        dc.content,
        dc.chunk_index AS "chunkIndex",
        dc.page_number AS "pageNumber",
        dc.metadata,
        ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${query})) AS score
      FROM document_chunks dc
      INNER JOIN documents d ON dc.document_id = d.id
      WHERE d.organization_id = ${organizationId}::uuid
        AND d.status = 'READY'::"DocumentStatus"
        ${documentCondition}
        AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${query})
      ORDER BY score DESC
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
