// ============================================================
// Security Hardening Middleware
// ============================================================
// Protects against prototype pollution, parameter tampering,
// and other common Node.js attack vectors.

/**
 * Recursively sanitize an object by removing dangerous keys
 * that could trigger prototype pollution.
 * @param {any} obj
 * @returns {any}
 */
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized = {};
  for (const key of Object.keys(obj)) {
    // Block prototype pollution vectors
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    sanitized[key] = sanitizeObject(obj[key]);
  }
  return sanitized;
}

/**
 * Express middleware that sanitizes req.body, req.query, and req.params
 * to prevent prototype pollution attacks.
 */
function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
}

module.exports = { sanitizeInput, sanitizeObject };
