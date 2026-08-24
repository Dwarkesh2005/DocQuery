const { verifyAccessToken } = require('../utils/jwt');
const { UnauthorizedError } = require('../utils/errors');
const { prisma } = require('../config/database');
const { apiKeyService, KEY_PREFIX } = require('../modules/api-keys/api-key.service');

// ============================================================
// Authentication Middleware — Dual JWT & API Key
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================
// Supports:
// 1. Bearer JWT (<token>)
// 2. Bearer API Key (dq_live_<prefix>_<secret>)
// 3. X-API-Key header (dq_live_<prefix>_<secret>)

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
async function authenticate(req, _res, next) {
  try {
    // ── 1. Check for X-API-Key Header ──
    const xApiKey = req.headers['x-api-key'];
    if (xApiKey && typeof xApiKey === 'string' && xApiKey.startsWith(KEY_PREFIX)) {
      const apiKeyRecord = await apiKeyService.validateApiKey(xApiKey);
      req.apiKey = apiKeyRecord;
      req.user = apiKeyRecord.creator;
      req.organization = apiKeyRecord.organization;
      req.membership = {
        id: 'api-key-session',
        userId: apiKeyRecord.createdBy,
        organizationId: apiKeyRecord.organizationId,
        role: 'ADMIN',
        organization: apiKeyRecord.organization,
      };
      return next();
    }

    // ── 2. Check for Authorization Header ──
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is required', 'AUTH_REQUIRED');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization format. Use: Bearer <token>', 'AUTH_INVALID_FORMAT');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError('Token is required', 'AUTH_REQUIRED');
    }

    // ── 3. Check if Bearer token is an API Key ──
    if (token.startsWith(KEY_PREFIX)) {
      const apiKeyRecord = await apiKeyService.validateApiKey(token);
      req.apiKey = apiKeyRecord;
      req.user = apiKeyRecord.creator;
      req.organization = apiKeyRecord.organization;
      req.membership = {
        id: 'api-key-session',
        userId: apiKeyRecord.createdBy,
        organizationId: apiKeyRecord.organizationId,
        role: 'ADMIN',
        organization: apiKeyRecord.organization,
      };
      return next();
    }

    // ── 4. Verify Standard JWT Access Token ──
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found', 'AUTH_USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
