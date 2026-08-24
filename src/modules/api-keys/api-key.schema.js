const { z } = require('zod');

const createApiKeySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    scopes: z.array(z.string()).optional().default(['*']),
    expiresInDays: z.number().int().positive().optional().nullable(),
  }),
});

const apiKeyIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid API key ID'),
  }),
});

const rotateApiKeySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid API key ID'),
  }),
  body: z.object({
    expiresInDays: z.number().int().positive().optional().nullable(),
  }).optional(),
});

module.exports = {
  createApiKeySchema,
  apiKeyIdParamSchema,
  rotateApiKeySchema,
};
