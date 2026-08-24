const { z } = require('zod');
const { env } = require('../../config/env');

// ============================================================
// Query Validation Schemas
// ============================================================

const queryRequestSchema = z.object({
  body: z.object({
    query: z
      .string({
        required_error: 'Query is required',
        invalid_type_error: 'Query must be a string',
      })
      .trim()
      .min(1, 'Query must not be empty or whitespace-only')
      .max(2000, 'Query cannot exceed 2000 characters'),
    topK: z
      .number({
        invalid_type_error: 'topK must be a number',
      })
      .int('topK must be an integer')
      .positive('topK must be greater than 0')
      .max(env.SEARCH_MAX_TOP_K, `topK cannot exceed ${env.SEARCH_MAX_TOP_K}`)
      .optional()
      .default(env.SEARCH_DEFAULT_TOP_K),
    documentId: z
      .string({
        invalid_type_error: 'documentId must be a string',
      })
      .uuid('Invalid document ID format')
      .optional(),
    threshold: z
      .number({
        invalid_type_error: 'threshold must be a number',
      })
      .min(0, 'threshold cannot be less than 0')
      .max(1, 'threshold cannot be greater than 1')
      .optional(),
    answerMode: z
      .enum(['STRICT', 'BALANCED', 'CONVERSATIONAL'])
      .optional(),
    enableHybrid: z.boolean().optional(),
    enableReranking: z.boolean().optional(),
  }),
});

module.exports = {
  queryRequestSchema,
};
