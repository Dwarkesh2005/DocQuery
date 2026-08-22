const { documentService } = require('./document.service');

// ============================================================
// Document Controller — Thin HTTP Layer
// ============================================================

/**
 * POST /api/v1/documents
 * Upload a document to the organization workspace.
 */
async function upload(req, res, next) {
  try {
    const document = await documentService.upload({
      organizationId: req.organization.id,
      userId: req.user.id,
      file: req.file,
      metadata: req.body?.metadata ? JSON.parse(req.body.metadata) : {},
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        document: {
          id: document.id,
          organizationId: document.organizationId,
          name: document.name,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          status: document.status,
          createdAt: document.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/documents/:id/process
 * Enqueue a document for background processing.
 */
async function process(req, res, next) {
  try {
    const result = await documentService.process(req.params.id, req.organization.id);

    res.status(200).json({
      success: true,
      message: 'Document processing started',
      data: {
        documentId: result.documentId,
        status: result.status,
        jobId: result.jobId,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/documents/:id
 * Retrieve document details and processing status.
 */
async function getById(req, res, next) {
  try {
    const document = await documentService.getById(req.params.id, req.organization.id);

    res.status(200).json({
      success: true,
      data: { document },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/documents
 * List documents for the active organization.
 */
async function list(req, res, next) {
  try {
    const result = await documentService.list(req.organization.id, req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  upload,
  process,
  getById,
  list,
};
