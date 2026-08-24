const { z } = require('zod');

// ============================================================
// Evaluation Schemas
// ============================================================

const createDatasetSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(1, 'Name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters'),
    description: z.string().trim().max(500).optional(),
    cases: z
      .array(
        z.object({
          question: z.string().trim().min(1, 'Question cannot be empty'),
          expectedAnswer: z.string().trim().optional(),
          expectedSources: z.array(z.string()).optional(),
          metadata: z.record(z.any()).optional(),
        })
      )
      .optional(),
  }),
});

const addCasesSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid dataset ID format'),
  }),
  body: z.object({
    cases: z
      .array(
        z.object({
          question: z.string().trim().min(1, 'Question cannot be empty'),
          expectedAnswer: z.string().trim().optional(),
          expectedSources: z.array(z.string()).optional(),
          metadata: z.record(z.any()).optional(),
        })
      )
      .min(1, 'At least one case is required'),
  }),
});

const datasetIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid dataset ID format'),
  }),
});

const createRunSchema = z.object({
  body: z.object({
    datasetId: z.string().uuid('Invalid dataset ID format'),
    config: z.record(z.any()).optional(),
    async: z.boolean().optional().default(false),
  }),
});

const runIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid run ID format'),
  }),
});

const benchmarkSchema = z.object({
  body: z.object({
    datasetId: z.string().uuid('Invalid dataset ID format'),
  }),
});

module.exports = {
  createDatasetSchema,
  addCasesSchema,
  datasetIdParamSchema,
  createRunSchema,
  runIdParamSchema,
  benchmarkSchema,
};
