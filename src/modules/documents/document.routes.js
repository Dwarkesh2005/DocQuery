const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Router } = require('express');
const multer = require('multer');
const documentController = require('./document.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { documentIdParamSchema, listDocumentsQuerySchema } = require('./document.schema');
const { env } = require('../../config/env');
const { BadRequestError } = require('../../utils/errors');

// ============================================================
// Document Storage Configuration (Multer)
// ============================================================

const uploadDir = path.resolve(env.UPLOAD_DIR || './uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  // Directory may already exist or be mounted externally
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBaseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `doc_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBaseName}${ext}`);
  },
});

const allowedMimes = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size
  },
  fileFilter: (_req, file, cb) => {
    if (allowedMimes.has(file.mimetype) || file.originalname.endsWith('.pdf') || file.originalname.endsWith('.txt') || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`Unsupported file type: ${file.mimetype}. Allowed: PDF, TXT, MD, CSV, JSON`));
    }
  },
});

// ============================================================
// Document Routes
// ============================================================

const router = Router();

// POST /api/v1/documents (Upload document: authenticate -> drain/upload -> resolveOrganization)
router.post(
  '/',
  authenticate,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return next(err);
      resolveOrganization(req, res, next);
    });
  },
  documentController.upload
);

// All subsequent document endpoints require authentication and active tenant resolution
router.use(authenticate, resolveOrganization);

// POST /api/v1/documents/:id/process (Enqueue processing job)
router.post('/:id/process', validate(documentIdParamSchema), documentController.process);

// GET /api/v1/documents/:id/permissions (List permissions on document)
router.get('/:id/permissions', validate(documentIdParamSchema), documentController.listPermissions);

// POST /api/v1/documents/:id/permissions (Grant permission on document)
router.post('/:id/permissions', validate(documentIdParamSchema), documentController.grantPermission);

// DELETE /api/v1/documents/:id/permissions/:permissionId (Revoke permission)
router.delete('/:id/permissions/:permissionId', documentController.revokePermission);

// GET /api/v1/documents/:id (Fetch document details & status)
router.get('/:id', validate(documentIdParamSchema), documentController.getById);

// GET /api/v1/documents (List documents)
router.get('/', validate(listDocumentsQuerySchema), documentController.list);

module.exports = router;
