const { apiKeyService } = require('./api-key.service');

// ============================================================
// API Key Controller
// Phase 9: Enterprise Intelligence, Security & Scale
// ============================================================

/**
 * POST /api/v1/api-keys
 * Create a new developer API key.
 */
async function create(req, res, next) {
  try {
    const { name, scopes, expiresInDays } = req.body;

    const result = await apiKeyService.createApiKey({
      organizationId: req.organization.id,
      userId: req.user.id,
      name,
      scopes,
      expiresInDays,
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully. Store the secret safely as it will not be displayed again.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/api-keys
 * List all API keys for the current organization.
 */
async function list(req, res, next) {
  try {
    const apiKeys = await apiKeyService.listApiKeys(req.organization.id);

    res.status(200).json({
      success: true,
      data: { apiKeys },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/api-keys/:id
 * Revoke an API key.
 */
async function revoke(req, res, next) {
  try {
    const result = await apiKeyService.revokeApiKey(req.organization.id, req.params.id);

    res.status(200).json({
      success: true,
      message: 'API key revoked successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/api-keys/:id/rotate
 * Rotate an existing API key.
 */
async function rotate(req, res, next) {
  try {
    const { expiresInDays } = req.body || {};

    const result = await apiKeyService.rotateApiKey(
      req.organization.id,
      req.params.id,
      expiresInDays,
    );

    res.status(200).json({
      success: true,
      message: 'API key rotated successfully. Store the new secret safely.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  create,
  list,
  revoke,
  rotate,
};
