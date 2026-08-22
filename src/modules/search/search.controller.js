const { searchService } = require('./search.service');

// ============================================================
// Search Controller — Thin HTTP Layer
// ============================================================

/**
 * POST /api/v1/search
 * Perform semantic search across documents in the active organization.
 */
async function search(req, res, next) {
  try {
    const { query, topK, documentId, threshold } = req.body;

    const data = await searchService.search({
      organizationId: req.organization.id,
      query,
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
  search,
};
