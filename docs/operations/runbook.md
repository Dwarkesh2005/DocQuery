# DocQuery SRE Operational Runbook

## Overview
This runbook provides emergency diagnostics, incident responses, and standard operating procedures (SOPs) for DocQuery production systems.

---

## Runbook Index
1. [API Outage / 5xx Spike](#1-api-outage--5xx-spike)
2. [Database Outage & Connection Exhaustion](#2-database-outage--connection-exhaustion)
3. [Redis Cache / Queue Broker Outage](#3-redis-cache--queue-broker-outage)
4. [Worker Backlog & Dead-Letter Queue (DLQ) Growth](#4-worker-backlog--dead-letter-queue-dlq-growth)
5. [LLM Provider Outage or Rate Limit](#5-llm-provider-outage-or-rate-limit)
6. [Security Incident / Suspicious Injection Activity](#6-security-incident--suspicious-injection-activity)
7. [Emergency Rollback Procedure](#7-emergency-rollback-procedure)
8. [Database Backup & Restore Procedure](#8-database-backup--restore-procedure)

---

### 1. API Outage / 5xx Spike

#### Symptoms
* Synthetic probes reporting HTTP 500 / 503 errors.
* Readiness probe (`GET /health/ready`) returning `503 Service Unavailable`.
* Alert: `API_ERROR_RATE_HIGH`.

#### Diagnostics
1. Check process health and uptime:
   ```bash
   curl -I http://localhost:3000/health/live
   curl -s http://localhost:3000/health/ready
   ```
2. Inspect recent structured error logs:
   ```bash
   docker logs --tail 100 docquery-api-1
   ```
3. Check Prometheus metrics:
   ```bash
   curl -s http://localhost:3000/metrics | grep http_
   ```

#### Recovery
* If the process is hung, trigger a restart. The non-root container with `dumb-init` will gracefully drain in-flight requests.
* If a single node is failing, remove it from the upstream load balancer target pool.

---

### 2. Database Outage & Connection Exhaustion

#### Symptoms
* `GET /health/ready` returns `checks.database.status: "unhealthy"`.
* Log messages contain `P1001: Can't reach database server` or `P2024: Timed out fetching a new connection from the connection pool`.

#### Diagnostics
1. Check PostgreSQL container health:
   ```bash
   docker exec -it docquery-postgres-1 pg_isready -U postgres
   ```
2. Inspect active PostgreSQL connection pool usage:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```

#### Recovery
* If connection pool is exhausted, scale connection pool limits via `DATABASE_POOL_MAX` or verify client instances are properly pooling connections.
* Restart PostgreSQL service if unrecoverable.

---

### 3. Redis Cache / Queue Broker Outage

#### Symptoms
* `GET /health/ready` returns `checks.redis.status: "degraded"`.
* BullMQ jobs fail to enqueue or report connection errors.

#### Diagnostics
1. Check Redis ping:
   ```bash
   docker exec -it docquery-redis-1 redis-cli ping
   ```
2. Verify memory consumption:
   ```bash
   docker exec -it docquery-redis-1 redis-cli info memory
   ```

#### Recovery
* DocQuery RAG and Embedding caches operate in **fail-open** mode during Redis outages: queries proceed directly to PostgreSQL vector search and embedding APIs.
* Restart Redis instance to restore background worker processing and distributed rate limiting.

---

### 4. Worker Backlog & Dead-Letter Queue (DLQ) Growth

#### Symptoms
* Document processing status remains `QUEUED` for > 60 seconds.
* DLQ error metrics increment.

#### Diagnostics
1. Inspect worker telemetry:
   ```bash
   curl -s http://localhost:3000/metrics | grep worker_
   ```
2. Check worker logs:
   ```bash
   docker logs --tail 100 docquery-worker-1
   ```

#### Recovery
* Scale worker replicas horizontally:
  ```bash
  docker compose -f docker-compose.prod.yml up -d --scale worker=4
  ```
* Failed jobs automatically retry up to 3 times with exponential backoff before landing in the DLQ for inspection.

---

### 5. LLM Provider Outage or Rate Limit

#### Symptoms
* External 429 or 500 errors from OpenAI / Cohere.
* RAG query latency spikes.

#### Diagnostics
1. Check LLM metrics:
   ```bash
   curl -s http://localhost:3000/health/metrics | jq .data.llm
   ```

#### Recovery
* Switch to fallback model tier or mock provider in emergency:
  ```bash
  export LLM_MODEL=gpt-4o-mini
  ```
* Semantic query cache serves popular answers during upstream API degradation.

---

### 6. Security Incident / Suspicious Injection Activity

#### Symptoms
* `prompt_injection_events` or `pii_events` alerts firing.
* Unauthorized cross-tenant access attempts.

#### Diagnostics
1. Inspect audit trail:
   ```bash
   curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/api/v1/audit-logs
   ```
2. Revoke compromised developer API keys:
   ```bash
   curl -X DELETE -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/api/v1/api-keys/<KEY_ID>
   ```

---

### 7. Emergency Rollback Procedure

1. Revert to previous stable container tag:
   ```bash
   docker pull docquery:v1.4.0
   docker compose -f docker-compose.prod.yml up -d --no-deps api worker
   ```
2. Confirm health status:
   ```bash
   curl -f http://localhost:3000/health/ready || exit 1
   ```

---

### 8. Database Backup & Restore Procedure

#### Create Backup
```bash
node scripts/backup-db.js
```

#### Verify Restore
```bash
node scripts/restore-test.js
```
