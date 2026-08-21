const { z } = require('zod');

// ============================================================
// Organization Validation Schemas
// ============================================================

const createOrganizationSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, 'Organization name is required')
      .max(100, 'Organization name must be 100 characters or less')
      .trim(),
  }),
});

const organizationIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid organization ID'),
  }),
});

module.exports = { createOrganizationSchema, organizationIdParamSchema };
