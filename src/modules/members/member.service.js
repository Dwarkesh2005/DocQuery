const { prisma } = require('../../config/database');
const {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} = require('../../utils/errors');

// ============================================================
// Member Service — Business Logic Layer
// ============================================================

/**
 * List all members of an organization.
 * Caller must already be verified as a member (via resolveOrganization).
 *
 * @param {string} organizationId
 */
async function listMembers(organizationId) {
  const members = await prisma.organizationMember.findMany({
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
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    joinedAt: m.createdAt,
  }));
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
}

module.exports = {
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
};
