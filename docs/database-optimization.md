# Database Optimization

## Index Optimization Strategy
Every index in DocQuery is justified by access patterns:

1. **`OrganizationMember(userId, organizationId)` — Unique Constraint**
   - *Query*: Enforces tenant membership uniqueness and accelerates `findUnique({ userId_organizationId })`.
2. **`OrganizationMember(organizationId, role)` — Composite Index**
   - *Query*: Optimizes role checks (e.g. counting owners `count({ where: { organizationId, role: 'OWNER' } })`).
   - *Trade-off*: Adds minimal write overhead on member role changes in exchange for fast index-only scans on authorization.
3. **`RefreshToken(userId, revoked)` — Composite Index**
   - *Query*: Accelerates token lookup and active session counting.
   - *Trade-off*: Speeds up logout revocation and token validation.

## Query Tuning
- **Selective Projections (`select`)**: Excludes `passwordHash` and unneeded fields from queries.
- **Relational Inclusions (`include`)**: Combines queries using Prisma JOIN relations to eliminate N+1 query patterns.
- **Transactions (`$transaction`)**: Ensures atomicity across multi-record creations (e.g. user + organization + membership).
