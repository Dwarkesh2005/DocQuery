// ============================================================
// Application Error Classes
// ============================================================
// Structured error hierarchy for consistent API responses.
// Each error carries a status code, machine-readable code,
// and human-readable message.

class AppError extends Error {
  constructor(statusCode, code, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(400, code, message);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTH_REQUIRED') {
    super(401, code, message);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists', code = 'CONFLICT') {
    super(409, code, message);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = {}) {
    super(422, 'VALIDATION_ERROR', message);
    this.details = details;
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
};
