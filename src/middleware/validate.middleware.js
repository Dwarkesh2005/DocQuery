const { ZodError } = require('zod');

// ============================================================
// Zod Validation Middleware
// ============================================================
// Generic middleware factory that validates request data
// against a Zod schema. Supports body, params, query, headers.

/**
 * Create validation middleware for the given Zod schema.
 * @param {import('zod').ZodObject} schema — Zod schema with optional keys: body, params, query, headers
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return (req, _res, next) => {
    try {
      const result = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
        headers: req.headers,
      });

      // Replace request data with parsed (and transformed) values
      if (result.body) req.body = result.body;
      if (result.params) req.params = result.params;
      if (result.query) req.query = result.query;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = {};
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          if (!details[path]) {
            details[path] = [];
          }
          details[path].push(issue.message);
        }

        return _res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          },
        });
      }
      next(error);
    }
  };
}

module.exports = { validate };
