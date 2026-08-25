// ============================================================
// Graceful Shutdown Orchestrator
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================
// Centralized shutdown logic that ensures all resources are
// cleaned up in the correct order:
//   1. Stop accepting new HTTP connections
//   2. Drain in-flight requests
//   3. Close BullMQ workers & queues
//   4. Disconnect Redis
//   5. Disconnect Prisma/PostgreSQL
//   6. Exit process

const { logger } = require('../config/logger');
const { env } = require('../config/env');

let isShuttingDown = false;

/**
 * Execute the graceful shutdown sequence.
 * @param {object} deps
 * @param {import('http').Server} [deps.server]
 * @param {import('@prisma/client').PrismaClient} [deps.prisma]
 * @param {Function} [deps.disconnectRedis]
 * @param {Function} [deps.closeWorkers]
 * @param {Function} [deps.closeQueues]
 * @param {string} [signal='SIGTERM']
 * @param {boolean} [exitProcess=true]
 * @returns {Promise<{ success: boolean, steps: string[] }>}
 */
async function executeShutdown({
  server,
  prisma,
  disconnectRedis,
  closeWorkers,
  closeQueues,
  signal = 'SIGTERM',
  exitProcess = true,
}) {
  const steps = [];
  logger.info({ signal }, 'Graceful shutdown initiated');

  // 1. Stop accepting new connections
  if (server && typeof server.close === 'function') {
    await new Promise((resolve) => {
      server.close(() => {
        steps.push('HTTP_SERVER_CLOSED');
        logger.info('HTTP server closed');
        resolve();
      });
    });
  }

  try {
    // 2. Close BullMQ workers (stop processing new jobs)
    if (closeWorkers) {
      await closeWorkers();
      steps.push('WORKERS_CLOSED');
      logger.info('BullMQ workers closed');
    }

    // 3. Close BullMQ queues
    if (closeQueues) {
      await closeQueues();
      steps.push('QUEUES_CLOSED');
      logger.info('BullMQ queues closed');
    }

    // 4. Disconnect Redis
    if (disconnectRedis) {
      await disconnectRedis();
      steps.push('REDIS_CLOSED');
      logger.info('Redis connection closed');
    }

    // 5. Disconnect database
    if (prisma && typeof prisma.$disconnect === 'function') {
      await prisma.$disconnect();
      steps.push('DATABASE_CLOSED');
      logger.info('Database connection closed');
    }

    if (exitProcess && process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }

    return { success: true, steps };
  } catch (error) {
    logger.error({ error: error.message }, 'Error during shutdown');
    if (exitProcess && process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    return { success: false, error: error.message, steps };
  }
}

/**
 * Register process signal handlers for production.
 */
function registerShutdownHandlers({ server, prisma, disconnectRedis, closeWorkers, closeQueues }) {
  const timeoutMs = env.SHUTDOWN_TIMEOUT_MS || 15000;

  function handleSignal(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const timer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, timeoutMs);

    if (timer.unref) timer.unref();

    executeShutdown({
      server,
      prisma,
      disconnectRedis,
      closeWorkers,
      closeQueues,
      signal,
      exitProcess: true,
    });
  }

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ error: reason }, 'Unhandled Rejection');
    handleSignal('UNHANDLED_REJECTION');
  });
}

module.exports = {
  executeShutdown,
  registerShutdownHandlers,
};
