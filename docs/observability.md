# Observability & Structured Logging

## Structured Logging with Pino
- **JSON Format**: Emits machine-parseable JSON logs in production for ingestion into Datadog, ELK, or CloudWatch.
- **Development Pretty Printing**: Formats human-readable colored logs via `pino-pretty` in local development.
- **Sensitive Data Redaction**: Automatically censors `password`, `token`, `authorization`, `refreshToken`, and `apiKey` fields before output.

## Request Tracing & Correlation
- **Request ID Middleware**: Injects or propagates `X-Request-Id` (e.g. `req_b4f1a2c3d4e5`).
- **Context Injection**: Every log statement includes `requestId`, `method`, `path`, `statusCode`, `durationMs`, and authenticated `userId`/`organizationId`.
- **Health Checks**:
  - `GET /health` (Liveness): Validates process uptime and status.
  - `GET /health/ready` (Readiness): Validates PostgreSQL connection and Redis ping latency.
