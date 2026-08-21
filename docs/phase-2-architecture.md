# DocQuery Phase 2 Architecture — Production-Grade Backend

## System Architecture

```
                          ┌─────────────────────────────┐
                          │     Client / Postman / UI   │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │         Express API         │
                          │                             │
                          │  • Request ID (req_...)     │
                          │  • Pino Structured Logger   │
                          │  • Helmet & CORS Security   │
                          │  • Prototype Sanitizer      │
                          │  • Distributed Rate Limiter │
                          │  • Redis Cache Middleware   │
                          └──────┬───────────────┬──────┘
                                 │               │
                    ┌────────────┴──┐         ┌──┴────────────┐
                    ▼               ▼         ▼               ▼
             ┌────────────┐  ┌────────────┐ ┌───────────┐ ┌───────────────┐
             │ PostgreSQL │  │   Redis    │ │  BullMQ   │ │ External APIs │
             │  (Prisma)  │  │  (Caching/ │ │  Queues   │ │ (Resilient    │
             │            │  │  Limiting) │ │ & Workers │ │  HTTP Client) │
             └────────────┘  └────────────┘ └─────┬─────┘ └───────────────┘
                                                  │
                                                  ▼
                                       ┌───────────────────────┐
                                       │ BullMQ Worker Process │
                                       │ • Audit Logger        │
                                       │ • Notification Sender │
                                       │ • Document AI Indexer │
                                       └───────────────────────┘
```

## Request Lifecycle in Phase 2

1. **`requestId`**: Generates or preserves incoming `X-Request-Id` (e.g. `req_a1b2c3d4e5f6`) and sets response header.
2. **`helmet` & `cors`**: Applies production-grade security headers (HSTS, frameguard, CSP, origin whitelist).
3. **`express.json` / `urlencoded`**: Limits payload size to 1MB.
4. **`sanitizeInput`**: Recursively strips `__proto__`, `constructor`, and `prototype` keys from inputs to prevent Prototype Pollution.
5. **`requestLogger`**: Captures request metrics (`requestId`, `method`, `path`, `statusCode`, `durationMs`, `userId`) and writes structured JSON via Pino.
6. **`rateLimit`**: Redis atomic sliding-window counter. Returns `429 Too Many Requests` with `RateLimit-*` and `Retry-After` headers if threshold is breached. Fail-open if Redis is temporarily unreachable.
7. **Routing**:
   - `/health` & `/health/ready`: Liveness and dependency readiness probes.
   - `/api/docs`: Interactive OpenAPI 3.0 Swagger UI.
   - `/api/v1/auth/*`: Authentication endpoints with strict rate limiting.
   - `/api/v1/organizations/*`: Workspace management with Cache-Aside pattern & pagination.
   - `/api/v1/organizations/:id/members/*`: RBAC-protected member management with automated cache invalidation & audit queue dispatch.
8. **Centralized Error Handler**: Translates errors into clean API envelopes (`success: false, error: { code, message, details }`), logging stack traces only on the server.
