# DocQuery — Enterprise Intelligence & Security Architecture

```
                                 Client Request (JWT or API Key)
                                                │
                                                ▼
                             ┌─────────────────────────────────────┐
                             │        Express API Gateway          │
                             │ (Rate Limiter, Tracing, PII Guard)  │
                             └──────────────────┬──────────────────┘
                                                │
                          Auth & Organization Resolution (API Key / JWT)
                                                │
                                    Centralized RBAC & Quotas
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
     ┌───────────────────────┐      ┌───────────────────────┐      ┌───────────────────────┐
     │  Document Management  │      │ Advanced RAG & Search │      │   Enterprise Admin    │
     │  & Intelligence Pipeline│     │ (Vector + Keyword +   │      │ (API Keys, Audit Logs,│
     │ (Versions, Extraction)│      │  Graph + Permissions) │      │  Usage & Quotas)      │
     └───────────┬───────────┘      └───────────┬───────────┘      └───────────┬───────────┘
                 │                              │                              │
                 ▼                              ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             Enterprise Services & Core Logic                             │
│                                                                                          │
│  [PromptSecurityService]    [DocumentAccessService]       [GraphRetrievalService]        │
│  [UsageMeteringService]     [QuotaService]                [AuditLoggingService]          │
│  [CostOptimizationService]  [ModelRouterService]          [ApiKeyAuthService]            │
└───────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               Persistence & Worker Layer                                 │
│                                                                                          │
│   PostgreSQL + pgvector            Redis Distributed Cache           BullMQ Workers      │
│  (10+ Core & Enterprise Tables)    (Semantic Cache & Rate Limit)    (Multi-Queue DLQ)    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Security & Pre-Retrieval Document Permission Flow

```
User Query Request
       │
       ▼
Resolve User & Organization
       │
       ▼
Compute Accessible Document IDs (DocumentAccessService)
       │
       ├──► If OWNER / ADMIN: allowedDocumentIds = null (All tenant documents accessible)
       │
       └──► If MEMBER / VIEWER: allowedDocumentIds = [id1, id2, ...] (Pre-filtered subset)
                 │
                 ▼
       PostgreSQL SQL Query
       WHERE d.organization_id = :orgId
         AND d.id = ANY(:allowedDocumentIds)   <── Unauthorized chunks are NEVER retrieved
                 │
                 ▼
       FTS / Dense / Graph Hybrid Fusion
                 │
                 ▼
       Prompt Injection & Untrusted Boundary Quarantine
                 │
                 ▼
       Grounded LLM Answer Generation
```
