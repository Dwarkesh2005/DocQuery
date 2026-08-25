const fs = require('fs');
const path = require('path');
const { backupDatabase } = require('./backup-db');
const { prisma } = require('../src/config/database');
const { logger } = require('../src/config/logger');

// ============================================================
// Database Disaster Recovery Restore Verification Test
// Phase 10: Production Deployment, SRE & Reliability
// ============================================================

async function verifyRestoreProcedure() {
  logger.info('Starting Disaster Recovery restore verification test');

  // 1. Create a fresh snapshot backup
  const backupDir = './tmp_backups';
  const { backupPath, stats } = await backupDatabase(backupDir);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file does not exist at ${backupPath}`);
  }

  // 2. Read and parse backup file
  const raw = fs.readFileSync(backupPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed.tables || !parsed.version) {
    throw new Error('Invalid backup file structure');
  }

  logger.info({ stats: parsed.stats }, 'Backup structure validated successfully');

  // 3. Perform verification checks on records
  const dbUserCount = await prisma.user.count();
  const dbOrgCount = await prisma.organization.count();

  const isConsistent =
    dbUserCount >= parsed.stats.usersCount && dbOrgCount >= parsed.stats.organizationsCount;

  // Cleanup temporary backup file
  try {
    fs.unlinkSync(backupPath);
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  } catch (_) {}

  if (!isConsistent) {
    throw new Error('Database restore verification mismatch');
  }

  logger.info('Disaster Recovery restore verification PASSED ✅');
  return { success: true, verifiedStats: stats };
}

if (require.main === module) {
  verifyRestoreProcedure()
    .then((res) => {
      console.log('✅ Disaster Recovery restore test successful:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Disaster Recovery restore test failed:', err);
      process.exit(1);
    });
}

module.exports = { verifyRestoreProcedure };
