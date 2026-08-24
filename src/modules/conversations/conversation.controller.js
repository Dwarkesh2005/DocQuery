const { conversationService } = require('./conversation.service');

// ============================================================
// Conversation Controller — Thin HTTP Layer
// ============================================================

/**
 * POST /api/v1/conversations
 * Create a new conversation session for the authenticated user and organization.
 */
async function create(req, res, next) {
  try {
    const conversation = await conversationService.createConversation({
      organizationId: req.organization.id,
      userId: req.user.id,
      title: req.body?.title,
    });

    res.status(201).json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/conversations
 * List conversations belonging to the authenticated user in the active tenant.
 */
async function list(req, res, next) {
  try {
    const data = await conversationService.listConversations({
      organizationId: req.organization.id,
      userId: req.user.id,
      query: req.query,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/conversations/:id
 * Retrieve a specific conversation by ID.
 */
async function getById(req, res, next) {
  try {
    const conversation = await conversationService.getConversation({
      id: req.params.id,
      organizationId: req.organization.id,
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/conversations/:id
 * Update a conversation title.
 */
async function update(req, res, next) {
  try {
    const conversation = await conversationService.updateConversation({
      id: req.params.id,
      organizationId: req.organization.id,
      userId: req.user.id,
      title: req.body.title,
    });

    res.status(200).json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/conversations/:id
 * Delete a conversation.
 */
async function deleteConversation(req, res, next) {
  try {
    const result = await conversationService.deleteConversation({
      id: req.params.id,
      organizationId: req.organization.id,
      userId: req.user.id,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/conversations/:id/messages
 * List message history for a conversation.
 */
async function listMessages(req, res, next) {
  try {
    const result = await conversationService.listMessages({
      conversationId: req.params.id,
      organizationId: req.organization.id,
      userId: req.user.id,
      query: req.query,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/conversations/:id/messages
 * Send a message and generate a grounded conversational RAG response.
 */
async function sendMessage(req, res, next) {
  try {
    const { content, topK, documentId, threshold } = req.body;

    const data = await conversationService.sendMessage({
      conversationId: req.params.id,
      organizationId: req.organization.id,
      userId: req.user.id,
      content,
      topK,
      documentId,
      threshold,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  create,
  list,
  getById,
  update,
  deleteConversation,
  listMessages,
  sendMessage,
};
