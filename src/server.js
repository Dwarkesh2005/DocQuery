const { env } = require('./config/env');
const { prisma } = require('./config/database');
const { logger } = require('./config/logger');
const { getRedisClient, disconnectRedis, isRedisReady } = require('./config/redis');
const { closeQueues } = require('./config/queue.config');
const { registerShutdownHandlers } = require('./utils/shutdown');
const app = require('./app');

// ============================================================
// Server Startup
// ============================================================

const server = app.listen(env.PORT, () => {
  logger.info({
    port: env.PORT,
    env: env.NODE_ENV,
    healthCheck: `http://localhost:${env.PORT}/health`,
    docs: env.NODE_ENV !== 'production' ? `http://localhost:${env.PORT}/api/docs` : undefined,
  }, '🚀 DocQuery API started');
});

// ── Initialize Redis (non-blocking) ──
try {
  getRedisClient();
} catch (error) {
  logger.warn({ error: error.message }, 'Redis connection failed — running in degraded mode');
}

// ── Start BullMQ workers when Redis is ready ──
let workersStarted = false;
function initWorkers() {
  if (workersStarted) return;
  workersStarted = true;
  try {
    const { startWorkers } = require('./workers/index');
    startWorkers();
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to start workers — running without background jobs');
  }
}

const redisClient = getRedisClient();
if (isRedisReady()) {
  initWorkers();
} else if (redisClient) {
  redisClient.once('ready', () => {
    initWorkers();
  });
}

// ── Graceful Shutdown ──
let workersCloseFunc = null;
try {
  const workers = require('./workers/index');
  workersCloseFunc = workers.closeWorkers;
} catch {
  // Workers module may not load if Redis is unavailable
}

registerShutdownHandlers({
  server,
  prisma,
  disconnectRedis,
  closeWorkers: workersCloseFunc,
  closeQueues,
});

module.exports = server;
