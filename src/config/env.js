const { z } = require('zod');
const dotenv = require('dotenv');

// Load .env file before validation
dotenv.config();

// ============================================================
// Environment Variable Schema
// ============================================================
// Zod-validated environment configuration.
// Fails fast at startup if required variables are missing.

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Server
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // bcrypt
  BCRYPT_SALT_ROUNDS: z
    .string()
    .default('12')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(4).max(20)),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(formatted, null, 2));
    process.exit(1);
  }

  return result.data;
}

const env = loadEnv();

module.exports = { env };
