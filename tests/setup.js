const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Clean all test data from the database.
 * Respects foreign key order.
 */
async function cleanDatabase() {
  await prisma.usageRecord.deleteMany().catch(() => {});
  await prisma.usageDailyAggregate.deleteMany().catch(() => {});
  await prisma.organizationQuota.deleteMany().catch(() => {});
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.entityRelation.deleteMany().catch(() => {});
  await prisma.entity.deleteMany().catch(() => {});
  await prisma.documentIntelligence.deleteMany().catch(() => {});
  await prisma.documentVersion.deleteMany().catch(() => {});
  await prisma.documentPermission.deleteMany().catch(() => {});
  await prisma.apiKey.deleteMany().catch(() => {});
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
