const { documentService } = require('./document.service');
const { documentAccessService } = require('./services/document-access.service');
const { ForbiddenError } = require('../../utils/errors');

// ============================================================
// Document Controller — Thin HTTP Layer
// Phase 9: Enterprise Intelligence, Security & Scale
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
    // Check permission
    const canWrite = await documentAccessService.canAccessDocument({
      userId: req.user.id,
      userRole: req.membership?.role,
      organizationId: req.organization.id,
      documentId: req.params.id,
      requiredLevel: 'WRITE',
    });

    if (!canWrite) {
      throw new ForbiddenError('You do not have write access to process this document', 'DOCUMENT_ACCESS_DENIED');
    }

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
    // Check permission
    const canRead = await documentAccessService.canAccessDocument({
      userId: req.user.id,
      userRole: req.membership?.role,
      organizationId: req.organization.id,
      documentId: req.params.id,
      requiredLevel: 'READ',
    });

    if (!canRead) {
      throw new ForbiddenError('You do not have access to view this document', 'DOCUMENT_ACCESS_DENIED');
    }

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

    // Filter documents by user access
    if (req.membership?.role !== 'OWNER' && req.membership?.role !== 'ADMIN') {
      const accessibleIds = await documentAccessService.getAccessibleDocumentIds({
        userId: req.user.id,
        userRole: req.membership?.role,
        organizationId: req.organization.id,
        requiredLevel: 'READ',
      });

      if (accessibleIds !== null && result.documents) {
        const set = new Set(accessibleIds);
        result.documents = result.documents.filter((d) => set.has(d.id));
      }
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/documents/:id/permissions
 * Share / grant access to a document.
 */
async function grantPermission(req, res, next) {
  try {
    const { granteeType, granteeId, granteeRole, permission } = req.body;

    const result = await documentAccessService.grantPermission({
      organizationId: req.organization.id,
      documentId: req.params.id,
      actorUserId: req.user.id,
      actorRole: req.membership?.role,
      granteeType,
      granteeId,
      granteeRole,
      permission,
    });

    res.status(201).json({
      success: true,
      message: 'Document permission granted successfully',
      data: { permission: result },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/documents/:id/permissions
 * List explicit access grants on a document.
 */
async function listPermissions(req, res, next) {
  try {
    const permissions = await documentAccessService.listPermissions({
      organizationId: req.organization.id,
      documentId: req.params.id,
      actorUserId: req.user.id,
      actorRole: req.membership?.role,
    });

    res.status(200).json({
      success: true,
      data: { permissions },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/documents/:id/permissions/:permissionId
 * Revoke explicit access grant on a document.
 */
async function revokePermission(req, res, next) {
  try {
    await documentAccessService.revokePermission({
      organizationId: req.organization.id,
      documentId: req.params.id,
      permissionId: req.params.permissionId,
      actorUserId: req.user.id,
      actorRole: req.membership?.role,
    });

    res.status(200).json({
      success: true,
      message: 'Document permission revoked successfully',
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
  grantPermission,
  listPermissions,
  revokePermission,
};
