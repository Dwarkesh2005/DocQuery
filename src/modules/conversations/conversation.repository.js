const { prisma } = require('../../config/database');

// ============================================================
// Conversation Repository
// ============================================================
// Data access layer strictly scoped to authenticated organization
// and user ownership (tenant isolation + user ownership).

class ConversationRepository {
  /**
   * Create a new conversation record.
   *
   * @param {object} data
   * @param {string} data.organizationId
   * @param {string} data.userId
   * @param {string} data.title
   * @returns {Promise<object>}
   */
  async create({ organizationId, userId, title }) {
    return prisma.conversation.create({
      data: {
        organizationId,
        userId,
        title,
      },
    });
  }

  /**
   * Find conversation by ID scoped to tenant organization and user owner.
   *
   * @param {string} id
   * @param {string} organizationId
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findByIdAndOrgAndUser(id, organizationId, userId) {
    return prisma.conversation.findFirst({
      where: {
        id,
        organizationId,
        userId,
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /**
   * List conversations for user in active organization.
   *
   * @param {string} organizationId
   * @param {string} userId
   * @param {object} [options]
   * @param {number} [options.skip=0]
   * @param {number} [options.take=20]
   * @returns {Promise<Array<object>>}
   */
  async listForUserAndOrg(organizationId, userId, { skip = 0, take = 20 } = {}) {
    return prisma.conversation.findMany({
      where: {
        organizationId,
        userId,
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /**
   * Count total conversations for user in active organization.
   *
   * @param {string} organizationId
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countForUserAndOrg(organizationId, userId) {
    return prisma.conversation.count({
      where: {
        organizationId,
        userId,
      },
    });
  }

  /**
   * Update conversation title and timestamps.
   *
   * @param {string} id
   * @param {string} organizationId
   * @param {string} userId
   * @param {object} data
   * @param {string} [data.title]
   * @returns {Promise<object>}
   */
  async update(id, organizationId, userId, data) {
    return prisma.conversation.updateMany({
      where: {
        id,
        organizationId,
        userId,
      },
      data,
    });
  }

  /**
   * Delete conversation. Cascading deletes remove messages and sources.
   *
   * @param {string} id
   * @param {string} organizationId
   * @param {string} userId
   * @returns {Promise<{ count: number }>}
   */
  async delete(id, organizationId, userId) {
    return prisma.conversation.deleteMany({
      where: {
        id,
        organizationId,
        userId,
      },
    });
  }

  /**
   * Create a single message (e.g. USER role).
   *
   * @param {object} data
   * @param {string} data.conversationId
   * @param {string} data.role
   * @param {string} data.content
   * @returns {Promise<object>}
   */
  async createMessage({ conversationId, role, content }) {
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role,
          content,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  /**
   * Create an assistant message with persisted citation sources in a transaction.
   *
   * @param {object} params
   * @param {string} params.conversationId
   * @param {string} params.content
   * @param {Array<object>} [params.sources]
   * @returns {Promise<object>}
   */
  async createAssistantMessageWithSources({ conversationId, content, sources = [] }) {
    return prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content,
        },
      });

      let createdSources = [];
      if (Array.isArray(sources) && sources.length > 0) {
        const sourceData = sources.map((s) => ({
          messageId: message.id,
          documentId: s.documentId,
          chunkId: s.chunkId,
          documentName: s.documentName || null,
          pageNumber: s.pageNumber ?? null,
          content: s.content,
          score: typeof s.score === 'number' ? s.score : null,
        }));

        await tx.messageSource.createMany({
          data: sourceData,
        });

        createdSources = await tx.messageSource.findMany({
          where: { messageId: message.id },
          orderBy: { createdAt: 'asc' },
        });
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return {
        ...message,
        sources: createdSources,
      };
    });
  }

  /**
   * Retrieve the most recent N messages for conversation context (in chronological order).
   *
   * @param {string} conversationId
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async getRecentMessages(conversationId, limit = 10) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    // Return in ascending chronological order for prompt injection
    return messages.reverse();
  }

  /**
   * List messages in a conversation in chronological order.
   * Supports offset and cursor pagination.
   *
   * @param {string} conversationId
   * @param {object} [options]
   * @param {number} [options.skip]
   * @param {number} [options.take]
   * @param {string} [options.cursorId]
   * @returns {Promise<Array<object>>}
   */
  async listMessages(conversationId, { skip, take = 20, cursorId } = {}) {
    const queryOptions = {
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        sources: {
          select: {
            id: true,
            documentId: true,
            chunkId: true,
            documentName: true,
            pageNumber: true,
            content: true,
            score: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    };

    if (cursorId) {
      queryOptions.cursor = { id: cursorId };
      queryOptions.skip = 1; // Skip the cursor itself
    } else if (typeof skip === 'number') {
      queryOptions.skip = skip;
    }

    return prisma.message.findMany(queryOptions);
  }

  /**
   * Count total messages in conversation.
   *
   * @param {string} conversationId
   * @returns {Promise<number>}
   */
  async countMessages(conversationId) {
    return prisma.message.count({
      where: { conversationId },
    });
  }
}

const conversationRepository = new ConversationRepository();

module.exports = {
  ConversationRepository,
  conversationRepository,
};
