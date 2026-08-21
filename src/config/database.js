const { PrismaClient } = require('@prisma/client');
const { env } = require('./env');

// ============================================================
// Singleton Prisma Client
// ============================================================
// In development, hot-reloading can create multiple Prisma
// instances. This pattern ensures a single connection pool.

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = { prisma };
