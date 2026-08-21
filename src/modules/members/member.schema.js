const { z } = require('zod');

// ============================================================
// Member Validation Schemas
// ============================================================

const addMemberSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email('Invalid email address')
      .transform((val) => val.toLowerCase().trim()),
    role: z.enum(['ADMIN', 'MEMBER'], {
      errorMap: () => ({ message: 'Role must be ADMIN or MEMBER' }),
    }),
  }),
});

const updateMemberRoleSchema = z.object({
  body: z.object({
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER'], {
      errorMap: () => ({ message: 'Role must be OWNER, ADMIN, or MEMBER' }),
    }),
  }),
  params: z.object({
    id: z.string().uuid('Invalid organization ID'),
    userId: z.string().uuid('Invalid user ID'),
  }),
});

const memberParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid organization ID'),
    userId: z.string().uuid('Invalid user ID'),
  }),
});

const listMembersParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid organization ID'),
  }),
});

module.exports = {
  addMemberSchema,
  updateMemberRoleSchema,
  memberParamsSchema,
  listMembersParamsSchema,
};
