# DocQuery

> Multi-tenant AI Document Intelligence & RAG SaaS Platform

[![Phase](https://img.shields.io/badge/Phase-1%20Complete-brightgreen)]()
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue)]()
[![Tests](https://img.shields.io/badge/Tests-44%20Passing-brightgreen)]()

## Overview

DocQuery is a backend-first, multi-tenant SaaS platform that will allow organizations to upload documents, process them asynchronously, extract and chunk text, generate embeddings, store vectors, perform semantic search, and generate answers using RAG (Retrieval-Augmented Generation).

**Current Status: Phase 1 — Authentication & Multi-Tenancy ✅**

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Express.js API                       │
│                                                          │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │  Helmet   │  │     CORS      │  │   Body Parser    │  │
│  └──────────┘  └───────────────┘  └──────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │              Middleware Chain                         ││
│  │  validate → authenticate → resolveOrg → requireRole  ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │   Auth    │  │ Organizations │  │    Members       │  │
│  │  Module   │  │    Module     │  │    Module        │  │
│  └────┬─────┘  └──────┬────────┘  └────────┬─────────┘  │
│       │               │                     │            │
│  ┌────┴───────────────┴─────────────────────┴─────────┐  │
│  │              Service Layer (Business Logic)         │  │
│  └────────────────────────┬────────────────────────────┘  │
│                           │                               │
│  ┌────────────────────────┴────────────────────────────┐  │
│  │              Prisma ORM (Data Access)               │  │
│  └────────────────────────┬────────────────────────────┘  │
│                           │                               │
│  ┌────────────────────────┴────────────────────────────┐  │
│  │              PostgreSQL (Database)                  │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Key Principles

- **Modular Architecture** — Feature modules with controller/service/routes separation
- **Thin Controllers** — HTTP concerns only; business logic in services
- **Tenant Isolation** — Every org-scoped query verified via membership
- **RBAC** — Role-based middleware (OWNER → ADMIN → MEMBER)
- **Security by Default** — Helmet, CORS, Zod validation, bcrypt, JWT

## Tech Stack

| Technology   | Purpose                  |
|-------------|--------------------------|
| Node.js      | Runtime                  |
| Express.js   | HTTP framework           |
| PostgreSQL   | Database                 |
| Prisma ORM   | Data access & migrations |
| JWT          | Stateless authentication |
| bcrypt       | Password hashing         |
| Zod          | Input validation         |
| Helmet       | Security headers         |
| CORS         | Cross-origin control     |
| Jest         | Testing                  |
| Supertest    | HTTP integration tests   |

## Phase 1 Features

- [x] User registration with default workspace
- [x] User login with generic error messages
- [x] JWT access tokens (short-lived)
- [x] Refresh tokens (DB-persisted, revocable)
- [x] Logout with refresh token revocation
- [x] Current user endpoint with org memberships
- [x] Organization CRUD
- [x] Organization membership management
- [x] Role-based access control (OWNER / ADMIN / MEMBER)
- [x] Tenant isolation via server-side membership verification
- [x] Zod request validation
- [x] Centralized error handling
- [x] bcrypt password hashing
- [x] Database constraints (unique, indexes, cascades)
- [x] Transactional operations (registration, org creation)
- [x] API versioning (`/api/v1`)
- [x] Security middleware (Helmet, CORS, body limits)
- [x] 44 automated integration tests

## Project Structure

```
src/
├── config/
│   ├── env.js              # Zod-validated environment config
│   └── database.js          # Singleton Prisma client
├── middleware/
│   ├── auth.middleware.js    # JWT authentication
│   ├── organization.middleware.js  # Tenant resolution
│   ├── role.middleware.js    # RBAC authorization
│   ├── validate.middleware.js # Zod validation
│   └── error.middleware.js   # Centralized error handler
├── modules/
│   ├── auth/
│   │   ├── auth.controller.js
│   │   ├── auth.service.js
│   │   ├── auth.routes.js
│   │   └── auth.schema.js
│   ├── organizations/
│   │   ├── organization.controller.js
│   │   ├── organization.service.js
│   │   ├── organization.routes.js
│   │   └── organization.schema.js
│   └── members/
│       ├── member.controller.js
│       ├── member.service.js
│       ├── member.routes.js
│       └── member.schema.js
├── utils/
│   ├── jwt.js               # Token generation & verification
│   ├── password.js           # bcrypt utilities
│   └── errors.js             # Application error classes
├── app.js                    # Express application setup
└── server.js                 # Server startup & shutdown

prisma/
└── schema.prisma             # Database schema

tests/
├── setup.js
├── auth.test.js
├── organization.test.js
├── member.test.js
└── tenant-isolation.test.js
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
git clone <repo-url>
cd DocQuery
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable              | Description                        | Example                    |
|-----------------------|------------------------------------|----------------------------|
| `DATABASE_URL`        | PostgreSQL connection string       | `postgresql://user:pass@localhost:5432/docquery` |
| `JWT_ACCESS_SECRET`   | Access token signing secret (16+ chars) | Random string         |
| `JWT_REFRESH_SECRET`  | Refresh token signing secret (16+ chars) | Random string        |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime            | `15m`                      |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime          | `7d`                       |
| `PORT`                | Server port                        | `3000`                     |
| `NODE_ENV`            | Environment                        | `development`              |
| `BCRYPT_SALT_ROUNDS`  | bcrypt cost factor                 | `12`                       |

### Database Setup

```bash
# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# View database (optional)
npx prisma studio
```

### Start Development Server

```bash
npm run dev
```

### Run Tests

```bash
npm test
```

## API Endpoints

All endpoints are prefixed with `/api/v1`.

### Authentication

| Method | Endpoint              | Auth | Description                        |
|--------|-----------------------|------|------------------------------------|
| POST   | `/auth/register`      | No   | Register new user                  |
| POST   | `/auth/login`         | No   | Login with credentials             |
| POST   | `/auth/refresh`       | No   | Refresh access token               |
| POST   | `/auth/logout`        | Yes  | Revoke refresh token               |
| GET    | `/auth/me`            | Yes  | Get current user with orgs         |

### Organizations

| Method | Endpoint              | Auth | Description                        |
|--------|-----------------------|------|------------------------------------|
| POST   | `/organizations`      | Yes  | Create organization                |
| GET    | `/organizations`      | Yes  | List user's organizations          |
| GET    | `/organizations/:id`  | Yes  | Get organization details           |

### Members

| Method | Endpoint                                    | Auth | Role           | Description          |
|--------|---------------------------------------------|------|----------------|----------------------|
| GET    | `/organizations/:id/members`                | Yes  | Any member     | List members         |
| POST   | `/organizations/:id/members`                | Yes  | OWNER, ADMIN   | Add member           |
| PATCH  | `/organizations/:id/members/:userId`        | Yes  | OWNER, ADMIN   | Update member role   |
| DELETE | `/organizations/:id/members/:userId`        | Yes  | OWNER, ADMIN   | Remove member        |

### Headers

```
Authorization: Bearer <access-token>
X-Organization-Id: <organization-uuid>     # Required for member endpoints
```

## Authentication Flow

```
Register/Login → Access Token (15m) + Refresh Token (7d, DB-persisted)
                     │                        │
                     │                        ├─ POST /auth/refresh → New Access Token
                     │                        └─ POST /auth/logout  → Token revoked in DB
                     │
                     └─ Used in Authorization: Bearer <token>
```

**Key decisions:**
- Access tokens are stateless JWTs — short-lived, not revocable until expiry
- Refresh tokens are persisted in PostgreSQL — revocable on logout
- Separate signing secrets for access and refresh tokens
- Token type field prevents type confusion attacks

## Multi-Tenancy Strategy

DocQuery uses **application-level tenant isolation** with a membership verification model:

1. User authenticates → `req.user`
2. `X-Organization-Id` header read → membership verified in DB
3. Only if user is a confirmed member → `req.organization` + `req.membership` set
4. All org-scoped queries use `organizationId` from verified context

**A user can NEVER access another organization's data by changing the `X-Organization-Id` header.** Membership is always verified server-side.

```javascript
// ✅ Correct — scoped to verified organization
prisma.document.findMany({
  where: { organizationId: req.organization.id }
});

// ❌ Never allowed — unscoped query on tenant data
prisma.document.findMany();
```

## RBAC Strategy

| Role   | Permissions                              |
|--------|------------------------------------------|
| OWNER  | Full org control, manage all members     |
| ADMIN  | Manage members (cannot modify OWNER)     |
| MEMBER | Basic resource access, list members      |

Enforced via `requireRole()` middleware in the route chain:

```
authenticate → resolveOrganization → requireRole('OWNER', 'ADMIN') → controller
```

## Security Decisions

- **bcrypt** for password hashing (configurable salt rounds)
- **Helmet** for HTTP security headers
- **CORS** for cross-origin control
- **Zod** for strict input validation on all endpoints
- **1MB body limit** to prevent payload attacks
- **Generic auth errors** — login never reveals whether email exists
- **Cascade deletes** — cleaning up related data on user/org deletion
- **No secrets in responses** — passwordHash, tokens never leaked
- **No stack traces in production** — error handler sanitizes output

## Future Phases

| Phase | Feature                              | Status    |
|-------|--------------------------------------|-----------|
| 1     | Authentication & Multi-Tenancy       | ✅ Done   |
| 2     | Document Upload & Processing         | Planned   |
| 3     | Text Extraction & Chunking           | Planned   |
| 4     | Embeddings & Vector Storage          | Planned   |
| 5     | Semantic Search & RAG                | Planned   |
| 6     | Conversations & Usage Tracking       | Planned   |

## License

UNLICENSED — Private project.