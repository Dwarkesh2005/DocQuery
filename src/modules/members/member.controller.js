const memberService = require('./member.service');

// ============================================================
// Member Controller — Thin HTTP Layer
// ============================================================

/**
 * GET /api/v1/organizations/:id/members
 */
async function listMembers(req, res, next) {
  try {
    const members = await memberService.listMembers(req.organization.id);

    res.status(200).json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/organizations/:id/members
 */
async function addMember(req, res, next) {
  try {
    const member = await memberService.addMember(req.organization.id, req.body);

    res.status(201).json({
      success: true,
      data: { member },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/organizations/:id/members/:userId
 */
async function updateMemberRole(req, res, next) {
  try {
    const member = await memberService.updateMemberRole(
      req.organization.id,
      req.params.userId,
      req.body,
      { userId: req.user.id, role: req.membership.role },
    );

    res.status(200).json({
      success: true,
      data: { member },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/organizations/:id/members/:userId
 */
async function removeMember(req, res, next) {
  try {
    await memberService.removeMember(
      req.organization.id,
      req.params.userId,
      { userId: req.user.id, role: req.membership.role },
    );

    res.status(200).json({
      success: true,
      data: { message: 'Member removed successfully' },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listMembers, addMember, updateMemberRole, removeMember };
