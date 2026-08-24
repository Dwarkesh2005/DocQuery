# DocQuery Phase 9 — Enterprise Intelligence, Security & Scale Specification

## 1. Overview

Phase 9 transforms DocQuery into an enterprise-grade multi-tenant knowledge platform with fine-grained RBAC, resource-level document permissions, developer API keys, knowledge graph hybrid retrieval, prompt injection defense, PII protection, immutable audit logging, usage metering, quota enforcement, cost optimizations, and scaled background workers.

---

## 2. Enterprise RBAC & Permissions Matrix

### Roles
- `OWNER`: Full administrative authority over organization, memberships, documents, billing, and API keys.
- `ADMIN`: Administrative access over members, documents, queries, API keys, audit logs, and usage.
- `MEMBER`: Access to document operations, conversations, queries, and search.
- `VIEWER`: Read-only access to documents, conversations, queries, and search.

### Permissions
- `ORGANIZATION_READ`, `ORGANIZATION_UPDATE`, `ORGANIZATION_DELETE`
- `MEMBER_READ`, `MEMBER_INVITE`, `MEMBER_UPDATE`, `MEMBER_REMOVE`
- `DOCUMENT_READ`, `DOCUMENT_CREATE`, `DOCUMENT_UPDATE`, `DOCUMENT_DELETE`, `DOCUMENT_SHARE`
- `CONVERSATION_READ`, `CONVERSATION_CREATE`, `CONVERSATION_DELETE`
- `QUERY_EXECUTE`, `SEARCH_EXECUTE`
- `API_KEY_READ`, `API_KEY_CREATE`, `API_KEY_REVOKE`
- `AUDIT_READ`
- `USAGE_READ`, `QUOTA_MANAGE`
- `GRAPH_READ`, `GRAPH_MANAGE`
- `EVALUATION_READ`, `EVALUATION_MANAGE`

---

## 3. Resource-Level Document Access Control

* Model: `DocumentPermission` (`USER`, `ROLE`, `ORGANIZATION` with `READ`, `WRITE`, `ADMIN`).
* Enforced **pre-retrieval** at SQL level (`document_id = ANY(allowedDocumentIds::uuid[])`) ensuring unauthorized chunks never enter RAG context.
* Permission Management APIs:
  - `POST /api/v1/documents/:id/permissions`
  - `GET /api/v1/documents/:id/permissions`
  - `DELETE /api/v1/documents/:id/permissions/:permissionId`

---

## 4. Developer API Keys

* Model: `ApiKey` (`keyPrefix`, `hashedSecret`, `scopes`, `expiresAt`, `revokedAt`).
* Key Format: `dq_live_<prefix>_<secret>`
* Storage: Cryptographic SHA-256 hash. Secret returned **only once** on creation.
* Dual Authentication: Supports `Authorization: Bearer <apiKey>` and `X-API-Key: <apiKey>`.
* APIs:
  - `POST /api/v1/api-keys`
  - `GET /api/v1/api-keys`
  - `DELETE /api/v1/api-keys/:id`
  - `POST /api/v1/api-keys/:id/rotate`

---

## 5. Enterprise Search API

* `POST /api/v1/search` supports multi-field filters:
  - `documentIds`: string[]
  - `documentTypes`: string[]
  - `tags`: string[]
  - `dateFrom`, `dateTo`: ISO string
* Pre-filters by tenant document permissions.

---

## 6. Document Intelligence & Versioning

* Intelligence:
  - Language detection (`detectLanguage`)
  - Classification (`classifyDocument`: `LEGAL`, `FINANCIAL`, `TECHNICAL`, `POLICY`, `GENERAL`)
  - Section extraction (`detectSections`)
  - Summary extraction (`generateSummary`)
  - Named entity & keyword extraction
* Versioning:
  - `DocumentVersion` model (`versionNumber`, `contentHash`, `filePath`, `fileSize`).
  - Content deduplication via SHA-256 hash.

---

## 7. Knowledge Graph & Graph Retrieval

* Models: `Entity` and `EntityRelation`.
* Co-occurrence and relation extraction during document ingestion.
* Graph search traverses entity subgraphs for keyword expansion and chunk linking.

---

## 8. RAG Security: Prompt Injection Defense & PII Protection

* `PromptSecurityService`:
  - Detects prompt injection, instruction overrides, system prompt leaks, and developer mode attempts.
  - Sanitizes tags (`<system>`, `[INST]`) and wraps chunks inside `<<<UNTRUSTED_DOCUMENT_CONTENT>>>`.
* `PiiDetectorService`:
  - Detects emails, phone numbers, credit card numbers, SSNs, and API keys.
  - Modes: `ALLOW`, `WARN`, `REDACT`, `BLOCK`.

---

## 9. Immutable Audit Logging

* Model: `AuditLog` (`action`, `resourceType`, `resourceId`, `userId`, `organizationId`, `ipAddress`, `userAgent`, `metadata`).
* Automatic PII redaction on persisted audit metadata.
* `GET /api/v1/audit-logs`: paginated filtering by action, actor, resource, and date range.

---

## 10. Usage Metering, Quotas & Cost Optimization

* Models: `UsageRecord`, `UsageDailyAggregate`, `OrganizationQuota`.
* Pricing Tiers: `FREE`, `PRO`, `TEAM`, `ENTERPRISE`.
* Quota Guarding: `requireQuota('QUERIES')`, `requireQuota('DOCUMENTS')` throwing `QuotaExceededError`.
* Cost Optimization:
  - In-memory and Redis embedding cache (`hash(text) -> vector`).
  - Context sentence compression & deduplication.
  - Complexity-based model router (`ModelRouterService`).
