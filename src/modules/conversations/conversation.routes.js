const { Router } = require('express');
const conversationController = require('./conversation.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { resolveOrganization } = require('../../middleware/organization.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createConversationSchema,
  updateConversationSchema,
  conversationIdParamSchema,
  sendMessageSchema,
} = require('./conversation.schema');

// ============================================================
// Conversation Routes
// ============================================================

const router = Router();

// All conversation endpoints require authentication and active tenant resolution
router.use(authenticate, resolveOrganization);

// Conversation CRUD
router.post('/', validate(createConversationSchema), conversationController.create);
router.get('/', conversationController.list);
router.get('/:id', validate(conversationIdParamSchema), conversationController.getById);
router.patch('/:id', validate(updateConversationSchema), conversationController.update);
router.delete('/:id', validate(conversationIdParamSchema), conversationController.deleteConversation);

// Message Endpoints
router.get('/:id/messages', validate(conversationIdParamSchema), conversationController.listMessages);
router.post('/:id/messages', validate(sendMessageSchema), conversationController.sendMessage);

module.exports = router;
