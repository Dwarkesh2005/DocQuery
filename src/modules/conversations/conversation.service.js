const { conversationRepository } = require('./conversation.repository');
const { queryService } = require('../query/query.service');
const { parsePaginationParams, buildOffsetPagination, buildCursorPagination, decodeCursor } = require('../../utils/pagination');
const { NotFoundError } = require('../../utils/errors');
const { logger } = require('../../config/logger');
const { env } = require('../../config/env');

// ============================================================
// Conversation Service — Business Logic Layer
// ============================================================
// Orchestrates multi-turn conversation lifecycle, message history,
// contextual RAG execution via Phase 4 + Phase 5, and citation persistence.

class ConversationService {
  /**
   * @param {object} [options]
   * @param {import('./conversation.repository').ConversationRepository} [options.repository]
   * @param {import('../query/query.service').QueryService} [options.queryService]
   */
  constructor(options = {}) {
    this.repository = options.repository || conversationRepository;
    this.queryService = options.queryService || queryService;
  }

  /**
   * Create a new conversation.
   *
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @param {string} [params.title]
   * @returns {Promise<object>}
   */
  async createConversation({ organizationId, userId, title }) {
    const defaultTitle = (title && title.trim()) || 'New Conversation';

    const conversation = await this.repository.create({
      organizationId,
      userId,
      title: defaultTitle,
    });

    logger.info(
      { conversationId: conversation.id, organizationId, userId },
      'Conversation created'
    );

    return conversation;
  }

  /**
   * List conversations for the authenticated user and organization.
   *
   * @param {object} params
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @param {object} [params.query]
   * @returns {Promise<object>}
   */
  async listConversations({ organizationId, userId, query = {} }) {
    const { limit, page } = parsePaginationParams(query);
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.repository.listForUserAndOrg(organizationId, userId, { skip, take: limit }),
      this.repository.countForUserAndOrg(organizationId, userId),
    ]);

    const formatted = conversations.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      userId: c.userId,
      title: c.title,
      messageCount: c._count?.messages || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return {
      conversations: formatted,
      pagination: buildOffsetPagination(total, page, limit),
    };
  }

  /**
   * Get a conversation by ID if owned by user and in active tenant organization.
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @returns {Promise<object>}
   */
  async getConversation({ id, organizationId, userId }) {
    const conversation = await this.repository.findByIdAndOrgAndUser(id, organizationId, userId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    return {
      id: conversation.id,
      organizationId: conversation.organizationId,
      userId: conversation.userId,
      title: conversation.title,
      messageCount: conversation._count?.messages || 0,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Update a conversation's title.
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @param {string} params.title
   * @returns {Promise<object>}
   */
  async updateConversation({ id, organizationId, userId, title }) {
    const conversation = await this.repository.findByIdAndOrgAndUser(id, organizationId, userId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    await this.repository.update(id, organizationId, userId, {
      title: title.trim(),
      updatedAt: new Date(),
    });

    logger.info({ conversationId: id, organizationId }, 'Conversation updated');

    return {
      id,
      organizationId,
      userId,
      title: title.trim(),
    };
  }

  /**
   * Delete a conversation.
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @returns {Promise<object>}
   */
  async deleteConversation({ id, organizationId, userId }) {
    const conversation = await this.repository.findByIdAndOrgAndUser(id, organizationId, userId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    await this.repository.delete(id, organizationId, userId);

    logger.info({ conversationId: id, organizationId }, 'Conversation deleted');

    return {
      id,
      deleted: true,
    };
  }

  /**
   * List messages in a conversation in chronological order.
   * Defaults to cursor-based pagination; supports offset-based when page is specified.
   *
   * @param {object} params
   * @param {string} params.conversationId
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @param {object} [params.query]
   * @returns {Promise<object>}
   */
  async listMessages({ conversationId, organizationId, userId, query = {} }) {
    const conversation = await this.repository.findByIdAndOrgAndUser(
      conversationId,
      organizationId,
      userId
    );
    if (!conversation) {
      throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    const { limit, cursor } = parsePaginationParams(query);

    // Offset-based pagination when page query parameter is explicitly provided
    if (query.page !== undefined) {
      const page = parseInt(query.page, 10) || 1;
      const skip = (page - 1) * limit;
      const [messages, total] = await Promise.all([
        this.repository.listMessages(conversationId, { skip, take: limit }),
        this.repository.countMessages(conversationId),
      ]);

      return {
        data: messages,
        pagination: buildOffsetPagination(total, page, limit),
      };
    }

    // Default to cursor-based pagination
    const decodedCursor = cursor ? decodeCursor(cursor) : undefined;
    const rawMessages = await this.repository.listMessages(conversationId, {
      take: limit + 1,
      cursorId: decodedCursor,
    });

    return buildCursorPagination(rawMessages, limit);
  }

  /**
   * Send a message in a conversation and receive a grounded RAG response.
   *
   * @param {object} params
   * @param {string} params.conversationId
   * @param {string} params.organizationId
   * @param {string} params.userId
   * @param {string} params.content
   * @param {number} [params.topK]
   * @param {string} [params.documentId]
   * @param {number} [params.threshold]
   * @returns {Promise<object>}
   */
  async sendMessage({
    conversationId,
    organizationId,
    userId,
    content,
    topK,
    documentId,
    threshold,
  }) {
    // 1. Verify conversation exists and belongs to active tenant + user
    const conversation = await this.repository.findByIdAndOrgAndUser(
      conversationId,
      organizationId,
      userId
    );
    if (!conversation) {
      throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    // 2. Fetch recent conversation history prior to new turn
    const historyLimit = env.CONVERSATION_HISTORY_LIMIT || 10;
    const priorMessages = await this.repository.getRecentMessages(conversationId, historyLimit);

    // 3. Persist USER message
    const userMessage = await this.repository.createMessage({
      conversationId,
      role: 'USER',
      content,
    });

    // 4. Build contextual retrieval query if prior user context exists
    let retrievalQuery = content;
    if (priorMessages.length > 0) {
      const recentUserQueries = priorMessages
        .filter((m) => m.role === 'USER')
        .slice(-2)
        .map((m) => m.content);

      if (recentUserQueries.length > 0) {
        retrievalQuery = `${recentUserQueries.join(' ')} ${content}`;
      }
    }

    // 5. Execute Phase 4 retrieval and Phase 5 grounded RAG
    const ragResult = await this.queryService.query({
      organizationId,
      query: content,
      topK,
      documentId,
      threshold,
      conversationHistory: priorMessages,
      retrievalQuery,
    });

    // 6. Persist ASSISTANT message and citation sources in a transaction
    const assistantMessage = await this.repository.createAssistantMessageWithSources({
      conversationId,
      content: ragResult.answer,
      sources: ragResult.citations,
    });

    // 7. Auto-update title if default and this is first user message
    let currentTitle = conversation.title;
    if (conversation.title === 'New Conversation' && priorMessages.length === 0) {
      const generatedTitle = content.length > 50 ? `${content.slice(0, 47)}...` : content;
      await this.repository.update(conversationId, organizationId, userId, {
        title: generatedTitle,
      });
      currentTitle = generatedTitle;
    }

    return {
      conversation: {
        id: conversation.id,
        title: currentTitle,
      },
      userMessage: {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      assistantMessage: {
        id: assistantMessage.id,
        conversationId: assistantMessage.conversationId,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
      citations: ragResult.citations || [],
      sources: assistantMessage.sources || [],
      metadata: ragResult.metadata || {},
    };
  }
}

const conversationService = new ConversationService();

module.exports = {
  ConversationService,
  conversationService,
};
