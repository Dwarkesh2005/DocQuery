const pino = require('pino');
const { env } = require('./env');

// ============================================================
// Structured Logger — Pino
// ============================================================
// JSON-structured logs with automatic redaction of sensitive
// fields. In development, pino-pretty formats for readability.
//
// Usage:
//   const { logger } = require('../config/logger');
//   logger.info({ userId, action: 'login' }, 'User logged in');

const logger = pino({
  level: env.LOG_LEVEL,
  // Redact sensitive fields from all log output
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'req.headers.authorization',
      'apiKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
  // Pretty-print in development only
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  // Serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

module.exports = { logger };
