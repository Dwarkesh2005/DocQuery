const fs = require('fs');
const path = require('path');
const { prisma } = require('../src/config/database');
const { logger } = require('../src/config/logger');

// ============================================================
// Database Disaster Recovery Backup Script
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================

async function backupDatabase(targetDir = './backups') {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(targetDir, `docquery_backup_${timestamp}.json`);

  logger.info({ backupPath }, 'Starting database snapshot backup');

  const [
    users,
    organizations,
    members,
    documents,
    chunksCount,
    apiKeys,
    permissions,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } }),
    prisma.organization.findMany(),
    prisma.organizationMember.findMany(),
    prisma.document.findMany(),
    prisma.documentChunk.count(),
    prisma.apiKey.findMany({ select: { id: true, organizationId: true, keyPrefix: true, scopes: true } }),
    prisma.documentPermission.findMany(),
  ]);

  const backupData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    stats: {
      usersCount: users.length,
      organizationsCount: organizations.length,
      membersCount: members.length,
      documentsCount: documents.length,
      chunksCount,
      apiKeysCount: apiKeys.length,
      permissionsCount: permissions.length,
    },
    tables: {
      users,
      organizations,
      members,
      documents,
      apiKeys,
      permissions,
    },
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  logger.info({ backupPath, stats: backupData.stats }, 'Database snapshot backup completed successfully');

  return { backupPath, stats: backupData.stats };
}

if (require.main === module) {
  backupDatabase()
    .then((res) => {
      console.log('✅ Backup complete:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Backup failed:', err);
      process.exit(1);
    });
}

module.exports = { backupDatabase };
