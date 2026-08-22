const swaggerUi = require('swagger-ui-express');

// ============================================================
// OpenAPI / Swagger Configuration
// ============================================================

const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DocQuery API',
    version: '0.2.0',
    description: 'Multi-tenant AI Document Intelligence & RAG SaaS Platform API',
    contact: { name: 'DocQuery Team' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Auth', description: 'Authentication & authorization' },
    { name: 'Organizations', description: 'Organization management' },
    { name: 'Members', description: 'Organization member management' },
    { name: 'Documents', description: 'Document upload and intelligence pipeline' },
    { name: 'Search', description: 'Semantic vector similarity search across documents' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'ERROR_CODE' },
              message: { type: 'string', example: 'Human-readable message' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Organization: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
          joinedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Member: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
          joinedAt: { type: 'string', format: 'date-time' },
        },
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          organizationId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          fileSize: { type: 'integer' },
          mimeType: { type: 'string' },
          status: { type: 'string', enum: ['UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'] },
          errorMessage: { type: 'string', nullable: true },
          pageCount: { type: 'integer', nullable: true },
          chunkCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
          hasNextPage: { type: 'boolean' },
          hasPrevPage: { type: 'boolean' },
        },
      },
    },
    parameters: {
      OrganizationIdHeader: {
        name: 'X-Organization-Id',
        in: 'header',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Organization context for tenant-scoped operations',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Check if the application process is alive',
        responses: {
          200: {
            description: 'Service is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'healthy' },
                        timestamp: { type: 'string', format: 'date-time' },
                        uptime: { type: 'integer' },
                        version: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Check if all dependencies (PostgreSQL, Redis) are healthy',
        responses: {
          200: { description: 'Service is ready to accept traffic' },
          503: { description: 'Service is not ready' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description: 'Creates a new user account with a default workspace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100, example: 'John Doe' },
                  email: { type: 'string', format: 'email', example: 'john@example.com' },
                  password: { type: 'string', minLength: 8, maxLength: 128, example: 'StrongPass123!' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered successfully' },
          409: { description: 'Email already exists' },
          422: { description: 'Validation error' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Authenticate with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid credentials' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'New access token issued' },
          401: { description: 'Invalid or revoked refresh token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Current user with organizations' },
          401: { description: 'Not authenticated' },
        },
      },
    },
    '/api/v1/organizations': {
      post: {
        tags: ['Organizations'],
        summary: 'Create an organization',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Organization created' },
          401: { description: 'Not authenticated' },
        },
      },
      get: {
        tags: ['Organizations'],
        summary: 'List user organizations',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'List of organizations with pagination' },
        },
      },
    },
    '/api/v1/organizations/{id}': {
      get: {
        tags: ['Organizations'],
        summary: 'Get organization by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Organization details' },
          403: { description: 'Not a member' },
        },
      },
    },
    '/api/v1/organizations/{id}/members': {
      get: {
        tags: ['Members'],
        summary: 'List organization members',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'List of members with pagination' },
        },
      },
      post: {
        tags: ['Members'],
        summary: 'Add a member',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['ADMIN', 'MEMBER'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Member added' },
          404: { description: 'User not found' },
          409: { description: 'Already a member' },
        },
      },
    },
    '/api/v1/organizations/{id}/members/{userId}': {
      patch: {
        tags: ['Members'],
        summary: 'Update member role',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MEMBER'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Role updated' },
          403: { description: 'Insufficient permissions' },
        },
      },
      delete: {
        tags: ['Members'],
        summary: 'Remove a member',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        responses: {
          200: { description: 'Member removed' },
          403: { description: 'Insufficient permissions' },
        },
      },
    },
    '/api/v1/documents': {
      post: {
        tags: ['Documents'],
        summary: 'Upload a document',
        description: 'Upload a PDF, TXT, or MD document to the organization workspace',
        security: [{ BearerAuth: [] }],
        parameters: [
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  metadata: { type: 'string', description: 'JSON metadata string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Document uploaded successfully with status UPLOADED' },
          400: { description: 'Bad request or invalid file type' },
          401: { description: 'Not authenticated' },
          403: { description: 'Access denied to organization' },
        },
      },
      get: {
        tags: ['Documents'],
        summary: 'List organization documents',
        security: [{ BearerAuth: [] }],
        parameters: [
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'] } },
        ],
        responses: {
          200: { description: 'List of documents with pagination' },
        },
      },
    },
    '/api/v1/documents/{id}/process': {
      post: {
        tags: ['Documents'],
        summary: 'Start background processing for document',
        description: 'Enqueues a BullMQ job to extract text, clean, chunk, generate embeddings, and store in pgvector',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        responses: {
          200: { description: 'Document processing enqueued with status QUEUED' },
          404: { description: 'Document not found' },
          409: { description: 'Document is already QUEUED or PROCESSING' },
        },
      },
    },
    '/api/v1/documents/{id}': {
      get: {
        tags: ['Documents'],
        summary: 'Get document details and processing status',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        responses: {
          200: { description: 'Document details and status' },
          404: { description: 'Document not found' },
        },
      },
    },
    '/api/v1/search': {
      post: {
        tags: ['Search'],
        summary: 'Semantic vector similarity search',
        description: 'Searches organization document chunks using natural language query and pgvector cosine similarity',
        security: [{ BearerAuth: [] }],
        parameters: [
          { '$ref': '#/components/parameters/OrganizationIdHeader' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', minLength: 1, maxLength: 2000, example: 'What is the vacation policy?' },
                  topK: { type: 'integer', minimum: 1, maximum: 20, default: 5, example: 5 },
                  documentId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
                  threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.2, example: 0.2 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Matching document chunks ranked by cosine similarity score',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', example: 'What is the vacation policy?' },
                        results: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              chunkId: { type: 'string', format: 'uuid' },
                              documentId: { type: 'string', format: 'uuid' },
                              content: { type: 'string' },
                              score: { type: 'number', example: 0.92 },
                              pageNumber: { type: 'integer', nullable: true },
                              chunkIndex: { type: 'integer' },
                              metadata: { type: 'object' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Bad request or missing organization header' },
          401: { description: 'Unauthorized — missing or invalid JWT' },
          403: { description: 'Forbidden — not a member of the organization' },
          404: { description: 'Specified documentId not found in active organization' },
          422: { description: 'Validation error (e.g. empty query or invalid topK)' },
        },
      },
    },
  },
};

/**
 * Setup Swagger UI middleware on an Express app.
 * @param {import('express').Application} app
 */
function setupSwagger(app) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'DocQuery API Documentation',
  }));
}

module.exports = { setupSwagger, swaggerDocument };
