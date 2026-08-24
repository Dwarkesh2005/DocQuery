const { searchService } = require('./search.service');

// ============================================================
// Search Controller — Thin HTTP Layer
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

/**
 * POST /api/v1/search
 * Perform enterprise search across documents in the active organization.
 */
async function search(req, res, next) {
  try {
    const { query, topK, documentId, threshold, filters } = req.body;

    const data = await searchService.search({
      organizationId: req.organization.id,
      query,
      topK,
      documentId,
      threshold,
      filters,
      userId: req.user?.id,
      userRole: req.membership?.role,
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
