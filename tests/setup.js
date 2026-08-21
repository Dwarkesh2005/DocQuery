const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Clean all test data from the database.
 * Respects foreign key order.
 */
async function cleanDatabase() {
  await prisma.refreshToken.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Disconnect the Prisma client.
 */
async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = { prisma, cleanDatabase, disconnectDatabase };
