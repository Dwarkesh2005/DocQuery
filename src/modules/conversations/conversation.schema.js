const { z } = require('zod');
const { env } = require('../../config/env');

// ============================================================
// Conversation Validation Schemas
// ============================================================

const createConversationSchema = z.object({
  body: z.object({
    title: z
      .string({
        invalid_type_error: 'Title must be a string',
      })
      .trim()
      .min(1, 'Title must not be empty')
      .max(255, 'Title cannot exceed 255 characters')
      .optional(),
  }).optional().default({}),
});

const updateConversationSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: 'Conversation ID is required',
        invalid_type_error: 'Conversation ID must be a string',
      })
      .uuid('Invalid conversation ID format'),
  }),
  body: z.object({
    title: z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .trim()
      .min(1, 'Title must not be empty')
      .max(255, 'Title cannot exceed 255 characters'),
  }),
});

const conversationIdParamSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: 'Conversation ID is required',
        invalid_type_error: 'Conversation ID must be a string',
      })
      .uuid('Invalid conversation ID format'),
  }),
});

const sendMessageSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: 'Conversation ID is required',
        invalid_type_error: 'Conversation ID must be a string',
      })
      .uuid('Invalid conversation ID format'),
  }),
  body: z.object({
    content: z
      .string({
        required_error: 'Content is required',
        invalid_type_error: 'Content must be a string',
      })
      .trim()
      .min(1, 'Message content must not be empty or whitespace-only')
      .max(5000, 'Message content cannot exceed 5000 characters'),
    topK: z
      .number({
        invalid_type_error: 'topK must be a number',
      })
      .int('topK must be an integer')
      .positive('topK must be greater than 0')
      .max(env.SEARCH_MAX_TOP_K, `topK cannot exceed ${env.SEARCH_MAX_TOP_K}`)
      .optional()
      .default(env.SEARCH_DEFAULT_TOP_K),
    documentId: z
      .string({
        invalid_type_error: 'documentId must be a string',
      })
      .uuid('Invalid document ID format')
      .optional(),
    threshold: z
      .number({
        invalid_type_error: 'threshold must be a number',
      })
      .min(0, 'threshold cannot be less than 0')
      .max(1, 'threshold cannot be greater than 1')
      .optional(),
  }),
});

module.exports = {
  createConversationSchema,
  updateConversationSchema,
  conversationIdParamSchema,
  sendMessageSchema,
};
