# CI/CD Pipeline

## GitHub Actions Workflow (`.github/workflows/ci.yml`)
The continuous integration pipeline automates quality checks on every push and pull request to the `main` branch.

## Pipeline Steps
1. **Service Containers**: Boots PostgreSQL 16 with pgvector (`pgvector/pgvector:pg16`) and Redis 7 health-checked service containers.
2. **Setup**: Installs Node 24 with npm caching.
3. **Dependencies**: `npm ci` installs deterministic production and dev dependencies.
4. **Prisma Generation**: `npx prisma generate` creates the database client.
5. **Database Migration**: `npx prisma migrate deploy` verifies schema migration compatibility.
6. **Linting**: `npm run lint` executes code quality checks.
7. **Automated Testing**: `npm test` runs the 60 integration and unit tests against PostgreSQL and Redis services.
8. **Docker Build Validation**: `docker build -t docquery:ci .` validates that the production multi-stage Dockerfile compiles without errors.
