const { AppError, ValidationError } = require('../utils/errors');
const { env } = require('../config/env');
const { Prisma } = require('@prisma/client');

// ============================================================
// Centralized Error Handling Middleware
// ============================================================
// Express error handler (4-argument signature).
// Converts known error types into consistent JSON responses.
// Never exposes stack traces, raw DB errors, or secrets.

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, _req, res, _next) {
  // ── Application Errors ──
  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // ── Prisma Known Request Errors ──
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
        },
      });
    }

    // Record not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
        },
      });
    }
  }

  // ── JWT Errors ──
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token',
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Token has expired',
      },
    });
  }

  // ── Syntax Error (malformed JSON body) ──
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid JSON in request body',
      },
    });
  }

  // ── Unknown / Unhandled Errors ──
  // Log full details server-side, return generic message to client
  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err);
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

module.exports = { errorHandler };
