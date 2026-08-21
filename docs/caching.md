# Redis Caching

## Cache-Aside Pattern
DocQuery implements the **Cache-Aside (Lazy Loading)** pattern:
1. Application receives a read request.
2. Checks Redis cache for the generated key.
3. **Cache HIT**: Returns cached data immediately (`X-Cache: HIT`).
4. **Cache MISS**: Queries PostgreSQL database via Prisma, saves result in Redis with a TTL, and returns response (`X-Cache: MISS`).

## Cached Endpoints & Justifications
1. **`GET /api/v1/auth/me`** (TTL: 300s)
   - *Why*: Called frequently on application load. Avoids repeated relational JOIN queries across users, organization members, and organizations.
2. **`GET /api/v1/organizations`** (TTL: 300s for page 1)
   - *Why*: Organization listing for user workspaces. Read-heavy.
3. **`GET /api/v1/organizations/:id`** (TTL: 300s)
   - *Why*: Frequently requested workspace metadata and role verification.
4. **`GET /api/v1/organizations/:id/members`** (TTL: 300s for page 1)
   - *Why*: Workspace member lists change infrequently but are queried frequently on dashboard navigation.

## Cache Invalidation Strategy
- **Organization Created**: Invalidates user's organization list (`docquery:cache:org:{userId}:*`).
- **Member Added / Role Updated / Removed**: Invalidates organization member cache (`docquery:cache:members:{orgId}:*`) and the target user's organization lists.
