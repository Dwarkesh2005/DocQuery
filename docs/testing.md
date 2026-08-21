# Automated Testing Suite

## Test Architecture
- **Framework**: Jest with Supertest for end-to-end HTTP integration tests.
- **Database Cleanup**: `tests/setup.js` clears database tables in foreign-key order before each test run.
- **Fail-Open Mocking**: Tests run deterministically in local and CI environments whether Redis is online or offline.

## Test Suites
- `tests/auth.test.js`: User registration, login, token refresh, logout, `/auth/me`.
- `tests/organization.test.js`: Organization creation, listing, membership checks.
- `tests/member.test.js`: Member addition, role updating, owner protection, member removal.
- `tests/tenant-isolation.test.js`: Cross-tenant header tampering prevention and IDOR checks.
- `tests/health.test.js`: Liveness and readiness endpoints.
- `tests/pagination.test.js`: Cursor encoding/decoding and offset calculation.
- `tests/resilience.test.js`: HTTP client retry backoff and error classification.
- `tests/rate-limiter.test.js`: Request IDs and prototype pollution sanitization.
- `tests/queue.test.js`: BullMQ job producer fail-safe operation.

## Running Tests
```bash
npm test
npm run test:verbose
```
