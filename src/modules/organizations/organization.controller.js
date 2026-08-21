const organizationService = require('./organization.service');

// ============================================================
// Organization Controller — Thin HTTP Layer
// ============================================================

/**
 * POST /api/v1/organizations
 */
async function create(req, res, next) {
  try {
    const organization = await organizationService.create(req.body, req.user.id);

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

module.exports = { create, list, getById };
