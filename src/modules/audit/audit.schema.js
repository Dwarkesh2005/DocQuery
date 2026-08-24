const { z } = require('zod');

const queryAuditLogsSchema = z.object({
  query: z.object({
    action: z.string().optional(),
    userId: z.string().uuid().optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().positive()).optional().default('1'),
    limit: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().positive().max(100)).optional().default('50'),
  }),
});

module.exports = {
  queryAuditLogsSchema,
};
