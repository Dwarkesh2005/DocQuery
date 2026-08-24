const crypto = require('crypto');
const { prisma } = require('../../config/database');
const { UnauthorizedError, NotFoundError, BadRequestError } = require('../../utils/errors');

// ============================================================
// Developer API Key Service
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

const KEY_PREFIX = 'dq_live_';

class ApiKeyService {
  /**
   * Hash an API key secret with SHA-256.
   * @param {string} rawKey
   * @returns {string}
   */
  hashSecret(rawKey) {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Create a new API key for an organization.
   * Returns the raw key ONLY once.
   */
  async createApiKey({ organizationId, userId, name, scopes = ['*'], expiresInDays = null }) {
    if (!name || typeof name !== 'string') {
      throw new BadRequestError('API key name is required', 'KEY_NAME_REQUIRED');
    }

    const keyPrefix = crypto.randomBytes(4).toString('hex'); // 8 hex chars
    const secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const rawKey = `${KEY_PREFIX}${keyPrefix}_${secret}`;
    const hashedSecret = this.hashSecret(rawKey);

    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        createdBy: userId,
        name: name.trim(),
        keyPrefix,
        hashedSecret,
        scopes: Array.isArray(scopes) ? scopes : ['*'],
        expiresAt,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return {
      apiKey,
      rawKey, // returned ONLY once
    };
  }

  /**
   * Validate a raw API key.
   * @param {string} rawKey
   * @returns {Promise<object>} Authenticated API key record with org and creator
   */
  async validateApiKey(rawKey) {
    if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) {
      throw new UnauthorizedError('Invalid API key format', 'API_KEY_INVALID');
    }

    const hashedSecret = this.hashSecret(rawKey);

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        hashedSecret,
      },
      include: {
        organization: true,
        creator: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!apiKey) {
      throw new UnauthorizedError('Invalid API key', 'API_KEY_INVALID');
    }

    if (apiKey.revokedAt) {
      throw new UnauthorizedError('API key has been revoked', 'API_KEY_REVOKED');
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      throw new UnauthorizedError('API key has expired', 'API_KEY_EXPIRED');
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    return apiKey;
  }

  /**
   * List API keys for an organization.
   */
  async listApiKeys(organizationId) {
    return prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke an API key.
   */
  async revokeApiKey(organizationId, apiKeyId) {
    const key = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
    });

    if (!key) {
      throw new NotFoundError('API key not found', 'API_KEY_NOT_FOUND');
    }

    return prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        revokedAt: true,
      },
    });
  }

  /**
   * Rotate an API key: generates a new secret and un-revokes/extends it.
   */
  async rotateApiKey(organizationId, apiKeyId, expiresInDays = null) {
    const existing = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('API key not found', 'API_KEY_NOT_FOUND');
    }

    const keyPrefix = crypto.randomBytes(4).toString('hex');
    const secret = crypto.randomBytes(32).toString('hex');
    const rawKey = `${KEY_PREFIX}${keyPrefix}_${secret}`;
    const hashedSecret = this.hashSecret(rawKey);

    let expiresAt = existing.expiresAt;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    const updated = await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        keyPrefix,
        hashedSecret,
        revokedAt: null,
        expiresAt,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    return {
      apiKey: updated,
      rawKey,
    };
  }
}

const apiKeyService = new ApiKeyService();

module.exports = {
  ApiKeyService,
  apiKeyService,
  KEY_PREFIX,
};
