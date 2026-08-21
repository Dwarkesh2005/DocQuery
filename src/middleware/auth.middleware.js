const { verifyAccessToken } = require('../utils/jwt');
const { UnauthorizedError } = require('../utils/errors');
const { prisma } = require('../config/database');

// ============================================================
// Authentication Middleware
// ============================================================
// Extracts Bearer token from Authorization header, verifies it,
// loads the user from database, and attaches to req.user.
//
// Request flow:
//   Authorization Header → JWT Verification → User Lookup → req.user

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function authenticate(req, _res, next) {
  try {
    // 1. Extract Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is required', 'AUTH_REQUIRED');
    }

    // 2. Validate Bearer format
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization format. Use: Bearer <token>', 'AUTH_INVALID_FORMAT');
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    if (!token) {
      throw new UnauthorizedError('Token is required', 'AUTH_REQUIRED');
    }

    // 3. Verify JWT — throws on invalid/expired
    const payload = verifyAccessToken(token);

    // 4. Load user from database (don't blindly trust JWT claims)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        // Never select passwordHash
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found', 'AUTH_USER_NOT_FOUND');
    }

    // 5. Attach authenticated user to request
    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
