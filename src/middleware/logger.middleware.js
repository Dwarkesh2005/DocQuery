const { logger } = require('../config/logger');
const { metricsService } = require('../services/metrics.service');

// ============================================================
// Request Logger Middleware
// ============================================================
// Logs every HTTP request on completion with structured JSON data:
//   requestId, method, path, statusCode, durationMs, userId, tenantId
//
// Automatically records HTTP telemetry in MetricsService.
// Sensitive headers and bodies are redacted automatically by Pino.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Log on response finish (not on request start) to capture statusCode and duration
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId: req.id || req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      contentLength: res.get ? res.get('content-length') : undefined,
    };

    // Record HTTP operational telemetry
    metricsService.recordHttpRequest({
      statusCode: res.statusCode,
      durationMs: duration,
    });

    // Attach user and tenant context if present
    if (req.user) {
      logData.userId = req.user.id;
    }
    if (req.organization) {
      logData.organizationId = req.organization.id;
      logData.tenantId = req.organization.id;
    }

    // Choose log level based on HTTP status code
    if (res.statusCode >= 500) {
      logger.error(logData, 'HTTP request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'HTTP request client error');
    } else {
      logger.info(logData, 'HTTP request completed');
    }
  });

  next();
}

module.exports = { requestLogger };


