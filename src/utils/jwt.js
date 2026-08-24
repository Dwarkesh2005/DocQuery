const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

// ============================================================
// Token Generation
// ============================================================

/**
 * Generate a short-lived access token.
 * @param {string} userId
 * @returns {string}
 */
function generateAccessToken(userIdOrPayload) {
  const userId = typeof userIdOrPayload === 'object' && userIdOrPayload !== null
    ? (userIdOrPayload.sub || userIdOrPayload.id)
    : userIdOrPayload;

  const payload = {
    sub: userId,
    type: 'access',
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

/**
 * Generate a longer-lived refresh token.
 * @param {string} userId
 * @param {string} tokenId — UUID stored in DB for revocation tracking
 * @returns {string}
 */
function generateRefreshToken(userId, tokenId) {
  const payload = {
    sub: userId,
    type: 'refresh',
    jti: tokenId,
  };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

// ============================================================
// Token Verification
// ============================================================

/**
 * Verify and decode an access token.
 * @param {string} token
 * @returns {{ sub: string, type: 'access' }}
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

    if (decoded.type !== 'access') {
      throw new jwt.JsonWebTokenError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw error;
    }
    throw new jwt.JsonWebTokenError('Invalid access token');
  }
}

/**
 * Verify and decode a refresh token.
 * @param {string} token
 * @returns {{ sub: string, type: 'refresh', jti: string }}
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);

    if (decoded.type !== 'refresh') {
      throw new jwt.JsonWebTokenError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw error;
    }
    throw new jwt.JsonWebTokenError('Invalid refresh token');
  }
}

// ============================================================
// Helper: Parse duration string to milliseconds
// ============================================================

/**
 * Parse duration like '15m', '1h', '7d' to milliseconds.
 * @param {string} duration
 * @returns {number}
 */
function parseDurationToMs(duration) {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  parseDurationToMs,
};
