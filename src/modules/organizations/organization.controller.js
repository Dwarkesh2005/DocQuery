const organizationService = require('./organization.service');
const { quotaService } = require('../../services/quota.service');
const { usageMeteringService } = require('../../services/usage-metering.service');
const { ForbiddenError } = require('../../utils/errors');
const { prisma } = require('../../config/database');

// ============================================================
// Organization Controller — Thin HTTP Layer
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

/**
 * POST /api/v1/organizations
 */
async function create(req, res, next) {
  try {
    const organization = await organizationService.create(req.body, req.user.id);

    // Initialize default quota for new organization
    await quotaService.getOrCreateQuota(organization.id, 'FREE').catch(() => {});

    res.status(201).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/organizations
 */
async function list(req, res, next) {
  try {
    const result = await organizationService.listForUser(req.user.id, req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/organizations/:id
 */
async function getById(req, res, next) {
  try {
    const organization = await organizationService.getById(req.params.id, req.user.id);

    res.status(200).json({
      success: true,
      data: { organization },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/organizations/:id/quota
 */
async function getQuota(req, res, next) {
  try {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: req.params.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied to organization quota', 'ORG_ACCESS_DENIED');
    }

    const quota = await quotaService.getOrCreateQuota(req.params.id);

    res.status(200).json({
      success: true,
      data: { quota },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/organizations/:id/usage
 */
async function getUsage(req, res, next) {
  try {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: req.params.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError('Access denied to organization usage', 'ORG_ACCESS_DENIED');
    }

    const usage = await usageMeteringService.getCurrentMonthlyUsage(req.params.id);

    res.status(200).json({
      success: true,
      data: { usage },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  create,
  list,
  getById,
  getQuota,
  getUsage,
};
