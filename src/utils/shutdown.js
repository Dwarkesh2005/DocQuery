// ============================================================
// Graceful Shutdown Orchestrator
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

let isShuttingDown = false;

/**
 * Register all shutdown handlers.
 * @param {object} deps
 * @param {import('http').Server} deps.server
 * @param {import('@prisma/client').PrismaClient} deps.prisma
 * @param {Function} deps.disconnectRedis
 * @param {Function} [deps.closeWorkers] - async function to close BullMQ workers
 * @param {Function} [deps.closeQueues]  - async function to close BullMQ queues
 */
function registerShutdownHandlers({ server, prisma, disconnectRedis, closeWorkers, closeQueues }) {
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    // 1. Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      // 2. Close BullMQ workers (stop processing new jobs)
      if (closeWorkers) {
        await closeWorkers();
        logger.info('BullMQ workers closed');
      }

      // 3. Close BullMQ queues
      if (closeQueues) {
        await closeQueues();
        logger.info('BullMQ queues closed');
      }

      // 4. Disconnect Redis
      if (disconnectRedis) {
        await disconnectRedis();
        logger.info('Redis connection closed');
      }

      // 5. Disconnect database
      await prisma.$disconnect();
      logger.info('Database connection closed');

      process.exit(0);
    } catch (error) {
      logger.error({ error: error.message }, 'Error during shutdown');
      process.exit(1);
    }
  }

  // Force shutdown after 15 seconds
  function forceShutdown(signal) {
    gracefulShutdown(signal);
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000);
  }

  process.on('SIGTERM', () => forceShutdown('SIGTERM'));
  process.on('SIGINT', () => forceShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ error: reason }, 'Unhandled Rejection');
    forceShutdown('UNHANDLED_REJECTION');
  });
}

module.exports = { registerShutdownHandlers };
