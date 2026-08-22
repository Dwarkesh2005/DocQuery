const { z } = require('zod');

// ============================================================
// Document Validation Schemas
// ============================================================

const documentIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid document ID format'),
  }),
});

const listDocumentsQuerySchema = z.object({
  query: z
    .object({
      page: z.string().optional(),
      limit: z.string().optional(),
      status: z.enum(['UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED']).optional(),
    })
    .optional(),
});

module.exports = {
  documentIdParamSchema,
  listDocumentsQuerySchema,
};
