const { Router } = require('express');
const { prisma } = require('../../config/database');
const { isRedisReady, getRedisClient } = require('../../config/redis');

const router = Router();

// ============================================================
// Health Check Routes
// ============================================================

/**
 * GET /health — Liveness Probe
 * Is the process alive and responding to HTTP?
 * Does NOT check external dependencies.
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: '0.2.0',
    },
  });
});

/**
 * GET /health/ready — Readiness Probe
 * Can the application actually serve traffic?
 * Checks PostgreSQL and Redis connectivity.
 */
router.get('/ready', async (_req, res) => {
  const checks = {};
  let isReady = true;

  // Check PostgreSQL
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart,
    };
  } catch (error) {
    isReady = false;
    checks.database = {
      status: 'unhealthy',
      error: 'Connection failed',
    };
  }

  // Check Redis
  try {
    if (isRedisReady()) {
      const redisStart = Date.now();
      await getRedisClient().ping();
      checks.redis = {
        status: 'healthy',
        latencyMs: Date.now() - redisStart,
      };
    } else {
      // Redis not ready but not critical — degraded mode
      checks.redis = {
        status: 'degraded',
        error: 'Not connected',
      };
    }
  } catch {
    checks.redis = {
      status: 'unhealthy',
      error: 'Ping failed',
    };
  }

  const status = isReady ? 200 : 503;

  res.status(status).json({
    success: isReady,
    data: {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    },
  });
});

const { metricsService } = require('../../services/metrics.service');

/**
 * GET /health/metrics — Observability & Telemetry Metrics
 * Returns aggregated application metrics across HTTP, RAG, LLM, Embeddings, and Workers.
 */
router.get('/metrics', (_req, res) => {
  const metrics = metricsService.getSummary();
  res.status(200).json({
    success: true,
    data: metrics,
  });
});

module.exports = router;

