const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { errorHandler } = require('./middleware/error.middleware');
const { requestId } = require('./middleware/request-id.middleware');
const { requestLogger } = require('./middleware/logger.middleware');
const { sanitizeInput } = require('./middleware/security.middleware');
const { rateLimit } = require('./middleware/rate-limiter.middleware');
const { env } = require('./config/env');
const { setupSwagger } = require('./config/swagger');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const organizationRoutes = require('./modules/organizations/organization.routes');
const memberRoutes = require('./modules/members/member.routes');
const documentRoutes = require('./modules/documents/document.routes');
const searchRoutes = require('./modules/search/search.routes');
const queryRoutes = require('./modules/query/query.routes');
const healthRoutes = require('./modules/health/health.routes');

// ============================================================
// Express Application
// ============================================================

const app = express();

// ── Request ID (must be first for correlation) ──
app.use(requestId);

// ── Security Middleware ──
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use(cors({
  origin: env.NODE_ENV === 'production' ? false : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-Cache', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  maxAge: 86400,
}));

// ── Body Parsing with size limits ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Input Sanitization (prototype pollution protection) ──
app.use(sanitizeInput);

// ── Request Logger ──
if (env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// ── Health Check Routes (unversioned, no rate limiting) ──
app.use('/health', healthRoutes);

// ── Swagger Documentation (non-production) ──
if (env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// ── API Rate Limiters ──
const authLimiter = rateLimit({
  max: env.RATE_LIMIT_AUTH_MAX,
  windowSec: env.RATE_LIMIT_AUTH_WINDOW,
  prefix: 'auth',
  keyFn: (req) => `ip:${req.ip}`,
});

const apiLimiter = rateLimit({
  max: env.RATE_LIMIT_API_MAX,
  windowSec: env.RATE_LIMIT_API_WINDOW,
  prefix: 'api',
});

// ── API v1 Routes ──
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/organizations', apiLimiter, organizationRoutes);
app.use('/api/v1/organizations/:id/members', apiLimiter, memberRoutes);
app.use('/api/v1/documents', apiLimiter, documentRoutes);
app.use('/api/v1/search', apiLimiter, searchRoutes);
app.use('/api/v1/query', apiLimiter, queryRoutes);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

// ── Centralized Error Handler ──
app.use(errorHandler);

module.exports = app;
