const crypto = require('crypto');

// ============================================================
// Request ID Middleware
// ============================================================
// Generates a unique request ID (UUIDv4) for every incoming HTTP request.
// If the client provides an X-Request-Id header, it is validated and reused
// for distributed tracing.
// The ID is attached to req.id and req.requestId and echoed in the response header.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const isValidIncoming =
    incoming &&
    typeof incoming === 'string' &&
    incoming.trim().length > 0 &&
    incoming.length <= 128 &&
    /^[a-zA-Z0-9_.-]+$/.test(incoming.trim());

  const id = isValidIncoming ? incoming.trim() : crypto.randomUUID();

  req.id = id;
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };

