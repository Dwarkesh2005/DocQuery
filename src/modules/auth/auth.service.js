const { prisma } = require('../../config/database');
const { hashPassword, comparePassword } = require('../../utils/password');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  parseDurationToMs,
} = require('../../utils/jwt');
const { env } = require('../../config/env');
const {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} = require('../../utils/errors');
const crypto = require('crypto');
const redisService = require('../../services/redis.service');

// ============================================================
// Auth Service — Business Logic Layer
// ============================================================

/**
 * Strip sensitive fields from a user object.
 * @param {object} user
 * @returns {{ id: string, email: string, name: string, createdAt: Date, updatedAt: Date }}
 */
function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Create a persisted refresh token in the database.
 * @param {string} userId
 * @returns {Promise<string>} — signed JWT refresh token
 */
async function createPersistedRefreshToken(userId) {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN));

  const signedToken = generateRefreshToken(userId, tokenId);

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      token: signedToken,
      userId,
      expiresAt,
    },
  });

  return signedToken;
}

// ============================================================
// Register
// ============================================================

/**
 * Register a new user with default workspace.
 * Uses a transaction: User + Organization + OrganizationMember
 * all succeed or all fail.
 *
 * @param {{ name: string, email: string, password: string }} input
 */
async function register({ name, email, password }) {
  // 1. Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ConflictError('A user with this email already exists', 'AUTH_EMAIL_EXISTS');
  }

  // 2. Hash password
  const passwordHash = await hashPassword(password);

  // 3. Transactional creation: User + Org + Membership
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        name,
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: `${name}'s Workspace`,
      },
    });

    await tx.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'OWNER',
      },
    });

    return { user, organization };
  });

  // 4. Generate tokens
  const accessToken = generateAccessToken(result.user.id);
  const refreshToken = await createPersistedRefreshToken(result.user.id);

  return {
    user: toSafeUser(result.user),
    accessToken,
    refreshToken,
  };
}

// ============================================================
// Login
// ============================================================

/**
 * Authenticate user with email + password.
 * Uses generic error message to avoid leaking user existence.
 *
 * @param {{ email: string, password: string }} input
 */
async function login({ email, password }) {
  // 1. Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // 2. Generic failure — don't reveal whether email exists
  if (!user) {
    throw new UnauthorizedError('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  // 3. Compare password
  const isValidPassword = await comparePassword(password, user.passwordHash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password', 'AUTH_INVALID_CREDENTIALS');
  }

  // 4. Generate tokens
  const accessToken = generateAccessToken(user.id);
  const refreshToken = await createPersistedRefreshToken(user.id);

  return {
    user: toSafeUser(user),
    accessToken,
    refreshToken,
  };
}

// ============================================================
// Refresh
// ============================================================

/**
 * Generate a new access token using a valid refresh token.
 * Validates the token exists in DB and is not revoked.
 *
 * @param {{ refreshToken: string }} input
 */
async function refresh({ refreshToken }) {
  // 1. Verify JWT signature and expiry
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token', 'AUTH_INVALID_REFRESH_TOKEN');
  }

  // 2. Look up in database — verify not revoked
  const storedToken = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
  });

  if (!storedToken || storedToken.revoked) {
    throw new UnauthorizedError('Refresh token has been revoked', 'AUTH_REFRESH_TOKEN_REVOKED');
  }

  if (storedToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token has expired', 'AUTH_REFRESH_TOKEN_EXPIRED');
  }

  // 3. Verify user still exists
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new UnauthorizedError('User not found', 'AUTH_USER_NOT_FOUND');
  }

  // 4. Generate new access token
  const accessToken = generateAccessToken(user.id);

  return { accessToken };
}

// ============================================================
// Logout
// ============================================================

/**
 * Revoke a refresh token. The access token remains valid
 * until it naturally expires (JWT is stateless).
 *
 * @param {{ refreshToken: string }} input
 */
async function logout({ refreshToken }) {
  // Attempt to verify and revoke — silent failure if token is invalid
  // (logout should be idempotent and never error for the user)
  try {
    const payload = verifyRefreshToken(refreshToken);

    await prisma.refreshToken.update({
      where: { id: payload.jti },
      data: { revoked: true },
    });
  } catch {
    // Silently ignore — token may already be invalid/revoked
    // This is intentional: logout should always "succeed" for UX
  }
}

// ============================================================
// Get Current User
// ============================================================

/**
 * Load the authenticated user with their organization memberships.
 *
 * @param {string} userId
 */
async function getCurrentUser(userId) {
  // Try cache first
  const cacheKey = redisService.buildKey('cache', 'user', userId, 'me');
  const cached = await redisService.get(cacheKey);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  const result = {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    organizations: user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
      joinedAt: m.createdAt,
    })),
  };

  // Cache for 5 minutes
  await redisService.set(cacheKey, result, 300);

  return result;
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getCurrentUser,
  toSafeUser,
};
