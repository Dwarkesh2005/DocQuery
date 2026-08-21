const { prisma } = require('../../config/database');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// ============================================================
// Organization Service — Business Logic Layer
// ============================================================

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

  return {
    id: result.id,
    name: result.name,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * List all organizations the authenticated user belongs to.
 *
 * @param {string} userId
 */
async function listForUser(userId) {
  const memberships = await prisma.organizationMember.findMany({
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
  });

  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
    joinedAt: m.createdAt,
  }));
}

/**
 * Get a single organization by ID — only if the user is a member.
 *
 * @param {string} organizationId
 * @param {string} userId
 */
async function getById(organizationId, userId) {
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

  return {
    ...membership.organization,
    role: membership.role,
    joinedAt: membership.createdAt,
  };
}

module.exports = { create, listForUser, getById };
