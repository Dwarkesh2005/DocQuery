# DocQuery Architecture — Phase 1

## System Overview

DocQuery Phase 1 implements the authentication and multi-tenancy foundation for the platform.

```
                    ┌─────────────┐
                    │   Client    │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  Express.js │
                    │   Server    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴────┐ ┌────┴─────┐ ┌────┴─────┐
        │   Auth   │ │   Org    │ │  Member  │
        │  Module  │ │  Module  │ │  Module  │
        └─────┬────┘ └────┬─────┘ └────┬─────┘
              │            │            │
        ┌─────┴────────────┴────────────┴─────┐
        │          Service Layer               │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────┴───────────────────────┐
        │           Prisma ORM                  │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────┴───────────────────────┐
        │          PostgreSQL                   │
        │  ┌──────┐ ┌──────┐ ┌──────────────┐  │
        │  │ User │ │ Org  │ │ OrgMember    │  │
        │  └──────┘ └──────┘ └──────────────┘  │
        │  ┌──────────────┐                     │
        │  │ RefreshToken │                     │
        │  └──────────────┘                     │
        └──────────────────────────────────────┘
```

## Request Lifecycle

```
HTTP Request
    │
    ├─ Helmet (security headers)
    ├─ CORS
    ├─ JSON body parser (1MB limit)
    │
    ├─ Route matching (/api/v1/...)
    │
    ├─ validate()           ─ Zod schema validation
    ├─ authenticate()       ─ JWT verification → user lookup → req.user
    ├─ resolveOrganization()─ X-Organization-Id → membership check → req.organization
    ├─ requireRole()        ─ Role authorization
    │
    ├─ Controller           ─ HTTP concerns only
    ├─ Service              ─ Business logic, DB operations
    │
    ├─ Response             ─ { success: true, data: {...} }
    │
    └─ errorHandler()       ─ Catches all errors → consistent JSON
```

## Database Schema

```
┌──────────────────┐       ┌──────────────────────┐       ┌──────────────────┐
│      User        │       │  OrganizationMember   │       │   Organization   │
├──────────────────┤       ├──────────────────────-┤       ├──────────────────┤
│ id          UUID │◄──┐   │ id          UUID      │   ┌──►│ id          UUID │
│ email    UNIQUE  │   ├───│ userId      FK        │   │   │ name             │
│ passwordHash     │   │   │ organizationId FK     │───┘   │ createdAt        │
│ name             │   │   │ role        ENUM      │       │ updatedAt        │
│ createdAt        │   │   │ createdAt             │       └──────────────────┘
│ updatedAt        │   │   ├──────────────────────-┤
└──────────────────┘   │   │ @@unique(userId, orgId)│
                       │   │ @@index(orgId)         │
┌──────────────────┐   │   │ @@index(userId)        │
│  RefreshToken    │   │   └───────────────────────-┘
├──────────────────┤   │
│ id          UUID │   │
│ token     UNIQUE │   │
│ userId      FK   │───┘
│ expiresAt        │
│ revoked   BOOL   │
│ createdAt        │
└──────────────────┘
```

## Tenant Isolation Model

The multi-tenancy model ensures complete data isolation between organizations:

1. **No direct org reference on User** — Users connect to orgs via the junction table
2. **Membership verification on every request** — `resolveOrganization` middleware
3. **Server-side enforcement** — Client cannot bypass by changing headers
4. **Future-proof** — All new resources will follow `where: { organizationId: req.organization.id }`

## Security Layers

| Layer            | Protection                                      |
|-----------------|--------------------------------------------------|
| Helmet          | HTTP security headers (XSS, clickjacking, etc.) |
| CORS            | Cross-origin request control                     |
| Body Parser     | 1MB payload limit                                |
| Zod             | Input validation on all endpoints                |
| bcrypt          | Password hashing (configurable rounds)           |
| JWT             | Stateless authentication with typed tokens       |
| Membership      | Server-side tenant isolation                     |
| RBAC            | Role-based operation authorization               |
| Error Handler   | No stack traces/DB errors in production          |
| Generic Errors  | Login doesn't reveal user existence              |
