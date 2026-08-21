const { prisma } = require('../../config/database');
const {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} = require('../../utils/errors');
const redisService = require('../../services/redis.service');
const { enqueueAuditEvent, enqueueNotification } = require('../../services/queue.service');
const { parsePaginationParams, buildOffsetPagination } = require('../../utils/pagination');

// ============================================================
// Member Service — Business Logic Layer
// ============================================================

const CACHE_TTL = 300; // 5 minutes

/**
 * Build a cache key for member data within an organization.
 */
function memberCacheKey(organizationId, suffix = '') {
  return redisService.buildKey('cache', 'members', organizationId, suffix);
}

/**
 * Invalidate member-related caches for an organization.
 */
async function invalidateMemberCache(organizationId) {
  await redisService.delPattern(redisService.buildKey('cache', 'members', organizationId, '*'));
}

/**
 * List all members of an organization.
 * Caller must already be verified as a member (via resolveOrganization).
 * Supports offset-based pagination.
 *
 * @param {string} organizationId
 * @param {object} [query] — req.query for pagination
 */
async function listMembers(organizationId, query = {}) {
  const { limit, page } = parsePaginationParams(query);

  // Try cache for page 1 default limit
  if (page === 1 && limit === 20) {
    const cached = await redisService.get(memberCacheKey(organizationId, 'list'));
    if (cached) return cached;
  }

  const skip = (page - 1) * limit;

  const [members, total] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.organizationMember.count({ where: { organizationId } }),
  ]);

  const memberList = members.map((m) => ({
    id: m.id,
    userId: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    joinedAt: m.createdAt,
  }));

  const result = {
    members: memberList,
    pagination: buildOffsetPagination(total, page, limit),
  };

  // Cache first page
  if (page === 1 && limit === 20) {
    await redisService.set(memberCacheKey(organizationId, 'list'), result, CACHE_TTL);
  }

  return result;
}

/**
 * Add a member to an organization by email.
 *
 * Rules:
 * - Target user must exist
 * - Cannot add duplicate membership (DB constraint)
 * - Cannot add someone as OWNER via this endpoint
 *
 * @param {string} organizationId
 * @param {{ email: string, role: string }} input
 */
async function addMember(organizationId, { email, role }) {
  // 1. Find the target user by email
  const targetUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!targetUser) {
    throw new NotFoundError('User with this email not found', 'USER_NOT_FOUND');
  }

  // 2. Check for existing membership
  const existingMembership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUser.id,
        organizationId,
      },
    },
  });

  if (existingMembership) {
    throw new ConflictError(
      'User is already a member of this organization',
      'MEMBER_ALREADY_EXISTS',
    );
  }

  // 3. Create membership
  const membership = await prisma.organizationMember.create({
    data: {
      userId: targetUser.id,
      organizationId,
      role,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  // Invalidate caches
  await invalidateMemberCache(organizationId);
  // Also invalidate the new member's org list cache
  await redisService.delPattern(redisService.buildKey('cache', 'org', targetUser.id, '*'));

  // Enqueue background jobs (non-blocking)
  enqueueAuditEvent({
    action: 'member.added',
    userId: targetUser.id,
    organizationId,
    details: { email, role },
  });
  enqueueNotification({
    type: 'member.invited',
    userId: targetUser.id,
    payload: { organizationId, role },
  });

  return {
    id: membership.id,
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    role: membership.role,
    joinedAt: membership.createdAt,
  };
}

/**
 * Update a member's role.
 *
 * Rules:
 * - Cannot modify an OWNER (only another OWNER-level operation could)
 * - ADMIN cannot promote to OWNER
 * - Cannot change own role
 *
 * @param {string} organizationId
 * @param {string} targetUserId
 * @param {{ role: string }} input
 * @param {{ userId: string, role: string }} actingUser — the authenticated user's membership
 */
async function updateMemberRole(organizationId, targetUserId, { role }, actingUser) {
  // 1. Find target membership
  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId,
      },
    },
  });

  if (!targetMembership) {
    throw new NotFoundError('Member not found in this organization', 'MEMBER_NOT_FOUND');
  }

  // 2. OWNER protection — cannot demote/modify an OWNER unless you're an OWNER
  if (targetMembership.role === 'OWNER' && actingUser.role !== 'OWNER') {
    throw new ForbiddenError(
      'Cannot modify an owner\'s role',
      'ROLE_OWNER_PROTECTED',
    );
  }

  // 3. Only OWNER can promote to OWNER
  if (role === 'OWNER' && actingUser.role !== 'OWNER') {
    throw new ForbiddenError(
      'Only owners can promote members to owner',
      'ROLE_PROMOTION_DENIED',
    );
  }

  // 4. Prevent self-demotion that would leave org without OWNER
  if (targetUserId === actingUser.userId && targetMembership.role === 'OWNER') {
    const ownerCount = await prisma.organizationMember.count({
      where: {
        organizationId,
        role: 'OWNER',
      },
    });

    if (ownerCount <= 1 && role !== 'OWNER') {
      throw new BadRequestError(
        'Cannot demote the last owner of an organization',
        'ROLE_LAST_OWNER',
      );
    }
  }

  // 5. Update role
  const updated = await prisma.organizationMember.update({
    where: { id: targetMembership.id },
    data: { role },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  // Invalidate caches
  await invalidateMemberCache(organizationId);
  await redisService.delPattern(redisService.buildKey('cache', 'org', targetUserId, '*'));

  // Audit event
  enqueueAuditEvent({
    action: 'member.role_updated',
    userId: actingUser.userId,
    organizationId,
    details: { targetUserId, oldRole: targetMembership.role, newRole: role },
  });

  return {
    id: updated.id,
    userId: updated.user.id,
    email: updated.user.email,
    name: updated.user.name,
    role: updated.role,
    joinedAt: updated.createdAt,
  };
}

/**
 * Remove a member from an organization.
 *
 * Rules:
 * - Cannot remove an OWNER unless you're an OWNER
 * - Cannot remove the last OWNER
 * - ADMIN cannot remove OWNER
 *
 * @param {string} organizationId
 * @param {string} targetUserId
 * @param {{ userId: string, role: string }} actingUser
 */
async function removeMember(organizationId, targetUserId, actingUser) {
  // 1. Find target membership
  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId,
      },
    },
  });

  if (!targetMembership) {
    throw new NotFoundError('Member not found in this organization', 'MEMBER_NOT_FOUND');
  }

  // 2. OWNER protection — ADMIN cannot remove OWNER
  if (targetMembership.role === 'OWNER' && actingUser.role !== 'OWNER') {
    throw new ForbiddenError(
      'Cannot remove an owner',
      'ROLE_OWNER_PROTECTED',
    );
  }

  // 3. Cannot remove the last owner
  if (targetMembership.role === 'OWNER') {
    const ownerCount = await prisma.organizationMember.count({
      where: {
        organizationId,
        role: 'OWNER',
      },
    });

    if (ownerCount <= 1) {
      throw new BadRequestError(
        'Cannot remove the last owner of an organization',
        'ROLE_LAST_OWNER',
      );
    }
  }

  // 4. Delete membership
  await prisma.organizationMember.delete({
    where: { id: targetMembership.id },
  });

  // Invalidate caches
  await invalidateMemberCache(organizationId);
  await redisService.delPattern(redisService.buildKey('cache', 'org', targetUserId, '*'));

  // Audit event
  enqueueAuditEvent({
    action: 'member.removed',
    userId: actingUser.userId,
    organizationId,
    details: { targetUserId, role: targetMembership.role },
  });
}

module.exports = {
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
};
