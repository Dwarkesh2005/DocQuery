const crypto = require('crypto');

// ============================================================
// Request ID Middleware
// ============================================================
// Generates a unique request ID for every incoming HTTP request
// (format: req_<12 hex chars>). If the client provides an
// X-Request-Id header, it is reused for distributed tracing.
// The ID is attached to req.id and echoed in the response header.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = incoming && typeof incoming === 'string' && incoming.length <= 64
    ? incoming
    : `req_${crypto.randomBytes(6).toString('hex')}`;

  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };
