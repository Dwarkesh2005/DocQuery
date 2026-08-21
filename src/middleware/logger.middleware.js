const { logger } = require('../config/logger');

// ============================================================
// Request Logger Middleware
// ============================================================
// Logs every HTTP request on completion with structured data:
//   requestId, method, path, statusCode, durationMs, userId
//
// Sensitive paths (/auth/login, /auth/register) never log
// request bodies.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Log on response finish (not on request start) to capture statusCode
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      contentLength: res.get('content-length'),
    };

    // Attach user context if authenticated
    if (req.user) {
      logData.userId = req.user.id;
    }
    if (req.organization) {
      logData.organizationId = req.organization.id;
    }

    // Choose log level based on status code
    if (res.statusCode >= 500) {
      logger.error(logData, 'Request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request error');
    } else {
      logger.info(logData, 'Request completed');
    }
  });

  next();
}

module.exports = { requestLogger };
