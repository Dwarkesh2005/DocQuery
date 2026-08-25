# DocQuery — Production Security Checklist

## 1. Authentication & API Security
- [x] Passwords hashed with bcrypt (minimum 12 salt rounds).
- [x] JWT access tokens are short-lived (15 minutes) and signed with high-entropy secrets (>= 16 chars).
- [x] Developer API keys use cryptographic SHA-256 hashing; raw secrets are never persisted.
- [x] Dual-authentication supports both JWT headers and API key tokens (`X-API-Key` or `Bearer dq_live_*`).

## 2. Multi-Tenancy & Authorization
- [x] Strict tenant isolation enforced at database level and pre-retrieval SQL level (`WHERE d.organization_id = :orgId`).
- [x] IDOR protection verified across documents, conversations, search, and audit logs.
- [x] Role-Based Access Control (RBAC) enforced with granular permissions (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
- [x] Pre-retrieval permission resolution guarantees unauthorized chunks never reach RAG context.

## 3. RAG Security & Prompt Defense
- [x] Prompt injection defense detects override markers, jailbreaks, and developer mode attempts.
- [x] Retrieved chunks quarantined inside explicit `<<<UNTRUSTED_DOCUMENT_CONTENT>>>` tags.
- [x] PII detector scrubs and masks emails, phones, SSNs, credit cards, and API keys.

## 4. Operational & Network Security
- [x] Helmet security headers applied (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS`).
- [x] Distributed rate limiters guard authentication and heavy RAG endpoints.
- [x] Multi-stage Docker container runs under unprivileged `nodejs:nodejs` non-root user.
- [x] Prometheus metrics and audit logs sanitize credentials, document text, and user secrets.
- [x] Automated disaster recovery restore procedures verified.
