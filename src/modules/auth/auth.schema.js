const { z } = require('zod');

// ============================================================
// Auth Validation Schemas
// ============================================================

const registerSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must be 100 characters or less')
      .trim(),
    email: z
      .string()
      .email('Invalid email address')
      .max(255, 'Email must be 255 characters or less')
      .transform((val) => val.toLowerCase().trim()),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be 128 characters or less'),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email('Invalid email address')
      .transform((val) => val.toLowerCase().trim()),
    password: z
      .string()
      .min(1, 'Password is required'),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z
      .string()
      .min(1, 'Refresh token is required'),
  }),
});

module.exports = { registerSchema, loginSchema, refreshSchema };
