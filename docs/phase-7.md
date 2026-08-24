# Phase 7: Production Hardening & Observability

## 1. Phase 7 Objectives
Phase 7 transitions DocQuery from a functional multi-tenant RAG SaaS prototype into a resilient, production-hardened enterprise platform. The core objectives include:
- Establishing end-to-end request tracing via correlation IDs and structured JSON logging.
- Implementing tiered, distributed rate limiting backed by Redis with fail-open safety.
- Introducing a tenant-isolated RAG caching layer with cryptographic key normalization and automatic invalidation.
- Hardening the RAG pipeline with context deduplication, token boundaries, retrieval confidence metadata, and prompt injection defenses.
- Elevating background worker reliability through exponential backoff retry strategies, transactional idempotency, and graceful shutdown.
- Providing operational observability via real-time telemetry metrics (`GET /health/metrics`).
- Enforcing strict multi-tenant security boundaries and sanitized error responses.

---

## 2. Architecture Changes
```
Client Request (with optional X-Request-Id)
  │
  ▼
[RequestId Middleware] ── UUIDv4 generation / propagation (req.id, req.requestId, X-Request-Id)
  │
  ▼
[Security Middleware] ── Helmet security headers, Prototype pollution sanitization, Body limits (1MB)
  │
  ▼
[Request Logger Middleware] ── Structured Pino logs with auto-redaction + Metrics recording
  │
  ▼
[Tiered Distributed Rate Limiter] ── Redis sliding counter (authLimiter, apiLimiter, ragLimiter)
  │
  ▼
[Authentication & Multi-Tenant Resolution] ── JWT validation + Organization context injection
  │
  ▼
[API Endpoints]
  ├─ /api/v1/documents ── [Document Processing Pipeline] ──> BullMQ Worker ──> [Cache Invalidation]
  ├─ /api/v1/search ──> [Tenant-Scoped pgvector cosine similarity]
  ├─ /api/v1/query ──> [RAG Cache] ─(HIT)─> Return Cached
  │                                 └─(MISS)─> [Search] ──> [Dedupe & Limits] ──> [LLM] ──> [Cache Set]
  └─ /api/v1/conversations ──> [Conversational RAG Context]
```

---

## 3. Rate Limiting
DocQuery uses a Redis-backed atomic sliding counter rate limiter (`src/middleware/rate-limiter.middleware.js`):
- **Tiers**:
  - **Auth endpoints (`/api/v1/auth/*`)**: 10 requests / 15 minutes per IP.
  - **General API endpoints (`/api/v1/organizations`, `/api/v1/documents`)**: 100 requests / 15 minutes per user/IP.
  - **Heavy RAG endpoints (`/api/v1/query`, `/api/v1/search`, `/api/v1/conversations/*`)**: 20 requests / 15 minutes per user/IP.
- **Fail-Open Resilience**: If Redis is offline, rate limiting logs a warning and permits requests rather than breaking service availability.
- **Response Headers**: Returns `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After`.
- **Status Code**: Returns HTTP `429 Too Many Requests` with structured error code `RATE_LIMIT_EXCEEDED`.

---

## 4. Redis Caching
The dedicated RAG Cache Service (`src/services/rag-cache.service.js`) caches expensive LLM and vector retrieval operations:
- **Key Namespacing**: `docquery:rag:tenant:<organizationId>:query:<sha256Hash>`
- **Cryptographic Normalization**: Hashes lowercase normalized query text, document scope filter, `topK`, and `threshold`.
- **Tenant Isolation**: Keys are explicitly namespaced by tenant UUID; cross-tenant cache hits are structurally impossible.
- **Automatic Invalidation**: `ragCacheService.invalidateTenant(organizationId)` is automatically triggered whenever a document is successfully processed to `READY` or deleted.
- **Configurable TTL**: `RAG_CACHE_TTL_SECONDS` (default: 3600s).
- **Fail-Open**: Cache get/set failures fall back to live retrieval without throwing.

---

## 5. RAG Hardening
- **Context Deduplication**: Eliminates duplicate chunk IDs and duplicate content hashes within retrieved results while preserving top similarity rankings.
- **Context Limits**:
  - Configurable `MAX_CONTEXT_CHUNKS` (default: 10).
  - Configurable `MAX_CONTEXT_TOKENS` (default: 3000 tokens, calculated using safe approximation).
- **No-Context Early Return**: Returns standard `NO_CONTEXT_ANSWER` without executing costly LLM calls when no chunks meet the threshold.
- **Retrieval Confidence Metadata**: Exposes `topScore`, `avgScore`, `retrievedChunks`, `documentIds`, and step latencies (`retrievalDurationMs`, `llmDurationMs`).
- **Citation Validation**: Verifies that every returned citation matches an actual retrieved chunk ID and document ID.
- **Prompt Injection Defense**: Wraps untrusted document content in strict delimiter tags (`<<<UNTRUSTED_DOCUMENT_CONTENT>>>`) with explicit instructions that document data is passive reference material and cannot override system directives.
- **Query Normalization**: Strips non-printable ASCII control characters and caps query length at 2000 characters.

---

## 6. Worker Reliability
- **Retry Strategy**: Configured with 3 attempts and exponential backoff (`delay: 1000ms`, `type: 'exponential'`).
- **Idempotency**: `documentChunkRepository.saveChunksWithEmbeddings` deletes existing chunks in a database transaction prior to inserting new ones, preventing duplicates on job retry.
- **Failed Job Handling**: BullMQ retains the last 5000 failed jobs for debugging. Worker failure logs structured metadata without exposing document contents or secrets.
- **Graceful Worker Shutdown**: Workers pause accepting new jobs, await completion of active jobs (with a 5s timeout), and cleanly close Redis and database connections.

---

## 7. Observability
The in-memory `MetricsService` (`src/services/metrics.service.js`) tracks live telemetry:
- **HTTP**: Total requests, status code distribution (2xx, 3xx, 4xx, 5xx), error count, average latency.
- **RAG**: Total queries, cache hits/misses, cache hit rate percentage, no-context count, retrieval/LLM latencies.
- **LLM**: Requests, errors, average latency, provider/model distribution.
- **Embeddings**: Total texts processed, requests, errors, average duration.
- **Workers**: Jobs processed, jobs failed, average duration.
- **Endpoint**: `GET /health/metrics` returns system uptime, memory usage (RSS/heap), and full operational telemetry without exposing sensitive data.

---

## 8. Security Improvements
- **Multi-Tenant Authorization**: Verified across all modules (documents, search, query, conversations, members, cache).
- **Authentication**: Strict JWT validation rejecting expired, malformed, or missing tokens.
- **Input Validation**: Zod schema validation on body, params, and query strings.
- **Payload Limits**: 1MB JSON body limit, 20MB file upload limit, string length constraints.
- **Error Masking**: Centralized error middleware masks stack traces, database credentials, SQL syntax, and internal paths in all client responses.
- **Security Headers**: Standard Helmet middleware enforcing HSTS, CSP, X-Frame-Options, X-Content-Type-Options (`nosniff`).

---

## 9. Environment Variables
| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_API_MAX` / `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per API rate limit window |
| `RATE_LIMIT_API_WINDOW` / `RATE_LIMIT_WINDOW_MS` | `900` / `900000` | Window size for general API rate limiting |
| `RATE_LIMIT_HEAVY_MAX` / `RAG_RATE_LIMIT_MAX_REQUESTS` | `20` | Max requests per RAG/search rate limit window |
| `RATE_LIMIT_HEAVY_WINDOW` / `RAG_RATE_LIMIT_WINDOW_MS` | `900` / `900000` | Window size for RAG rate limiting |
| `RAG_CACHE_TTL_SECONDS` | `3600` | Time-to-live for cached RAG responses (seconds) |
| `MAX_CONTEXT_CHUNKS` | `10` | Maximum chunks passed to LLM context |
| `MAX_CONTEXT_TOKENS` | `3000` | Maximum token budget for LLM context |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |

---

## 10. API Behavior Changes
- **Response Headers**: All responses include `X-Request-Id`. Cached responses include `X-Cache: HIT | MISS`.
- **RAG Metadata**: `POST /api/v1/query` and `POST /api/v1/conversations/:id/messages` return enhanced `metadata` including `topScore`, `avgScore`, `documentIds`, `retrievalDurationMs`, `llmDurationMs`, and `cacheHit`.
- **Health Metrics**: New endpoint `GET /health/metrics` returns real-time performance and telemetry data.

---

## 11. Testing Strategy
Automated test coverage is enforced across all sub-phases:
1. `tests/request-infrastructure.test.js`: Request ID generation, header propagation, structured logger redaction.
2. `tests/rate-limiter-phase7.test.js`: Tiered limits, 429 status code, retry-after headers, per-user/IP isolation, fail-open behavior.
3. `tests/rag-cache.test.js`: RAG cache hits/misses, tenant isolation, invalidation on document update, fail-open degradation.
4. `tests/rag-hardening.test.js`: Context deduplication, token limits, no-context early returns, confidence scoring, citation validation, prompt injection defense, query normalization.
5. `tests/worker-reliability.test.js`: Retry/backoff configuration, chunk storage idempotency, graceful worker shutdown.
6. `tests/observability.test.js`: HTTP, RAG, LLM, embedding, worker metrics aggregation, `GET /health/metrics`.
7. `tests/security-hardening.test.js`: Multi-tenant isolation across all resources, JWT validation, error response sanitization, Helmet headers.
8. Full regression verification across all Phase 1–6 test suites.

---

## 12. Performance Considerations
- Redis caching reduces LLM API costs and query latency from ~1200ms to <10ms for repeated queries.
- Context deduplication and token capping prevent context window overflow and unnecessary token consumption.
- Asynchronous metrics recording introduces sub-millisecond overhead.

---

## 13. Failure Scenarios
- **Redis Outage**: Rate limiter and RAG cache automatically fail open, logging warnings while allowing requests and live generation to continue uninterrupted.
- **LLM Provider Outage**: Returns HTTP 500 with sanitized error response without leaking credentials or stack traces.
- **Worker Crash**: In-flight jobs are recovered and safely retried using exponential backoff and idempotent chunk replacement.

---

## 14. Production Deployment Considerations
- Configure production Redis cluster with persistence and eviction policy `allkeys-lru` or `volatile-lru`.
- Ensure PostgreSQL pgvector extension is enabled and HNSW index is populated.
- Set `NODE_ENV=production` and supply secure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (minimum 32 characters in production).
- Deploy separate worker processes (`src/workers/standalone.js`) for horizontal background task scaling.
