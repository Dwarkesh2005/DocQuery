const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Clean all test data from the database.
 * Respects foreign key order.
 */
async function cleanDatabase() {
  await prisma.evaluationResult.deleteMany().catch(() => {});
  await prisma.evaluationRun.deleteMany().catch(() => {});
  await prisma.evaluationCase.deleteMany().catch(() => {});
  await prisma.evaluationDataset.deleteMany().catch(() => {});
  await prisma.messageSource.deleteMany().catch(() => {});
  await prisma.message.deleteMany().catch(() => {});
  await prisma.conversation.deleteMany().catch(() => {});
  await prisma.documentChunk.deleteMany().catch(() => {});
  await prisma.document.deleteMany().catch(() => {});
  await prisma.refreshToken.deleteMany().catch(() => {});
  await prisma.organizationMember.deleteMany().catch(() => {});
  await prisma.organization.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
}

/**
 * Disconnect the Prisma client.
 */
async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = { prisma, cleanDatabase, disconnectDatabase };
