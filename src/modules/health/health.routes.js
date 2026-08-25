const { Router } = require('express');
const { prisma } = require('../../config/database');
const { isRedisReady, getRedisClient } = require('../../config/redis');
const { metricsService } = require('../../services/metrics.service');
const { prometheusService } = require('../../services/prometheus.service');

const router = Router();

// ============================================================
// Health & Observability Routes
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================

/**
 * GET /health/live — Liveness Probe
 * Lightweight process check. Answers: Is the process alive?
 * Does NOT query external databases or Redis.
 */
router.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready — Readiness Probe
 * Answers: Can this instance accept customer traffic?
 * Validates connectivity to PostgreSQL and Redis.
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
      error: 'Database connection failed',
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
      checks.redis = {
        status: 'degraded',
        error: 'Redis not ready',
      };
    }
  } catch (error) {
    checks.redis = {
      status: 'unhealthy',
      error: 'Redis ping failed',
    };
  }

  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    success: isReady,
    data: {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    },
  });
});

/**
 * GET /health — Detailed Health Check
 * Answers: Comprehensive system status and uptime.
 */
router.get('/', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'healthy';
  } catch {
    dbStatus = 'unhealthy';
  }

  const redisStatus = isRedisReady() ? 'healthy' : 'degraded';
  const overallHealthy = dbStatus === 'healthy';

  res.status(overallHealthy ? 200 : 503).json({
    success: overallHealthy,
    data: {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      version: process.env.APP_VERSION || '0.2.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },
    },
  });
});

/**
 * GET /health/metrics — JSON Telemetry Metrics
 */
router.get('/metrics', (_req, res) => {
  const metrics = metricsService.getSummary();
  res.status(200).json({
    success: true,
    data: metrics,
  });
});

module.exports = router;
