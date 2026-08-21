const { env } = require('./config/env');
const { prisma } = require('./config/database');
const app = require('./app');

// ============================================================
// Server Startup
// ============================================================

const server = app.listen(env.PORT, () => {
  console.log(`🚀 DocQuery API running on port ${env.PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${env.PORT}/health`);
});

// ============================================================
// Graceful Shutdown
// ============================================================

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('HTTP server closed.');

    await prisma.$disconnect();
    console.log('Database connection closed.');

    process.exit(0);
  });

  // Force shutdown after 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejections — log and exit
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = server;
