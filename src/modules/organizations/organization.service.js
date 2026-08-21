const { prisma } = require('../../config/database');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const redisService = require('../../services/redis.service');
const { enqueueAuditEvent } = require('../../services/queue.service');
const { parsePaginationParams, buildOffsetPagination } = require('../../utils/pagination');

// ============================================================
// Organization Service — Business Logic Layer
// ============================================================

const CACHE_TTL = 300; // 5 minutes

/**
 * Build a user-specific cache key for organization data.
 */
function orgCacheKey(userId, suffix = '') {
  return redisService.buildKey('cache', 'org', userId, suffix);
}

/**
 * Invalidate all organization-related caches for a user.
 */
async function invalidateOrgCache(userId) {
  await redisService.delPattern(redisService.buildKey('cache', 'org', userId, '*'));
}

/**
 * Create a new organization. The creating user becomes OWNER.
 * Uses a transaction for atomicity.
 *
 * @param {{ name: string }} input
 * @param {string} userId — authenticated user's ID
 */
async function create({ name }, userId) {
  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name },
    });

    await tx.organizationMember.create({
      data: {
        userId,
        organizationId: organization.id,
        role: 'OWNER',
      },
    });

    return organization;
  });

  // Invalidate user's org list cache
  await invalidateOrgCache(userId);

  // Enqueue audit event (non-blocking)
  enqueueAuditEvent({
    action: 'org.created',
    userId,
    organizationId: result.id,
    details: { name },
  });

  return {
    id: result.id,
    name: result.name,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * List all organizations the authenticated user belongs to.
 * Supports offset-based pagination.
 *
 * @param {string} userId
 * @param {object} [query] — req.query for pagination
 */
async function listForUser(userId, query = {}) {
  const { limit, page } = parsePaginationParams(query);

  // Try cache first (only for page 1 with default limit)
  if (page === 1 && limit === 20) {
    const cached = await redisService.get(orgCacheKey(userId, 'list'));
    if (cached) return cached;
  }

  const skip = (page - 1) * limit;

  const [memberships, total] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.organizationMember.count({ where: { userId } }),
  ]);

  const organizations = memberships.map((m) => ({
    ...m.organization,
    role: m.role,
    joinedAt: m.createdAt,
  }));

  const result = {
    organizations,
    pagination: buildOffsetPagination(total, page, limit),
  };

  // Cache first page
  if (page === 1 && limit === 20) {
    await redisService.set(orgCacheKey(userId, 'list'), result, CACHE_TTL);
  }

  return result;
}

/**
 * Get a single organization by ID — only if the user is a member.
 *
 * @param {string} organizationId
 * @param {string} userId
 */
async function getById(organizationId, userId) {
  // Try cache
  const cacheKey = orgCacheKey(userId, organizationId);
  const cached = await redisService.get(cacheKey);
  if (cached) return cached;

  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!membership) {
    throw new ForbiddenError(
      'You do not have access to this organization',
      'ORG_ACCESS_DENIED',
    );
  }

  const result = {
    ...membership.organization,
    role: membership.role,
    joinedAt: membership.createdAt,
  };

  // Cache the result
  await redisService.set(cacheKey, result, CACHE_TTL);

  return result;
}

module.exports = { create, listForUser, getById };
