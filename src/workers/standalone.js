// ============================================================
// Standalone Worker Process
// ============================================================
// Runs BullMQ workers as a separate process for Docker and
// horizontal scaling. Does NOT start an HTTP server.

require('../config/env');
const { logger } = require('../config/logger');
const { getRedisClient, disconnectRedis } = require('../config/redis');
const { prisma } = require('../config/database');
const { startWorkers, closeWorkers } = require('./index');

logger.info('Starting standalone worker process...');

// Initialize Redis
getRedisClient();

// Wait for Redis to be ready, then start workers
setTimeout(() => {
  try {
    startWorkers();
    logger.info('Standalone workers started');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start workers');
    process.exit(1);
  }
}, 2000);

// Graceful shutdown
async function shutdown(signal) {
  logger.info({ signal }, 'Worker shutdown initiated');
  try {
    await closeWorkers();
    await disconnectRedis();
    await prisma.$disconnect();
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Worker shutdown error');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
