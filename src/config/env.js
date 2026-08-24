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

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Rate Limiting (requests / window in seconds or ms)
  RATE_LIMIT_AUTH_MAX: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_AUTH_WINDOW: z
    .string()
    .default('900')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_API_MAX: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_API_WINDOW: z
    .string()
    .default('900')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_HEAVY_MAX: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_HEAVY_WINDOW: z
    .string()
    .default('900')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  RAG_RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  RAG_RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),

  // Phase 7 — Caching & Context Limits
  RAG_CACHE_TTL_SECONDS: z
    .string()
    .default('3600')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  MAX_CONTEXT_CHUNKS: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  MAX_CONTEXT_TOKENS: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Phase 3 — Document Intelligence & Processing
  CHUNK_SIZE: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  CHUNK_OVERLAP: z
    .string()
    .default('150')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().nonnegative()),
  EMBEDDING_PROVIDER: z.enum(['openai', 'mock']).default('openai'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSION: z
    .string()
    .default('1536')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  OPENAI_API_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default('./uploads'),

  // Phase 4 — Semantic Search
  SEARCH_SIMILARITY_THRESHOLD: z
    .string()
    .default('0.2')
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0).max(1)),
  SEARCH_DEFAULT_TOP_K: z
    .string()
    .default('5')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  SEARCH_MAX_TOP_K: z
    .string()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),

  // Phase 5 — RAG Answer Generation
  LLM_PROVIDER: z.enum(['openai', 'mock']).default('openai'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),

  // Phase 6 — Conversations & Query History
  CONVERSATION_HISTORY_LIMIT: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),

  // Phase 8 — Advanced RAG & Evaluation
  ENABLE_HYBRID_SEARCH: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  ENABLE_QUERY_REWRITE: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  ENABLE_RERANKING: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  RERANKER_PROVIDER: z
    .enum(['none', 'score', 'cohere'])
    .default('score'),
  COHERE_API_KEY: z.string().optional(),
  RRF_K_CONSTANT: z
    .string()
    .default('60')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  DEFAULT_ANSWER_MODE: z
    .enum(['STRICT', 'BALANCED', 'CONVERSATIONAL'])
    .default('STRICT'),
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
