const { queryService } = require('./query.service');

// ============================================================
// Query Controller — Thin HTTP Layer
// ============================================================

/**
 * POST /api/v1/query
 * Execute a RAG query against documents in the active organization.
 */
async function query(req, res, next) {
  try {
    const { query: userQuery, topK, documentId, threshold } = req.body;

    const data = await queryService.query({
      organizationId: req.organization.id,
      query: userQuery,
      topK,
      documentId,
      threshold,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  query,
};
