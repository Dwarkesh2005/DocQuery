# DocQuery

> Production-Grade Multi-Tenant AI Document Intelligence, Advanced RAG & Evaluation SaaS Platform

[![Phase](https://img.shields.io/badge/Phase-10%20Complete-brightgreen)]()
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18%20%2B%20pgvector-blue)]()
[![Redis](https://img.shields.io/badge/Redis-BullMQ%20%2B%20Cache-red)]()
[![Tests](https://img.shields.io/badge/Tests-312%20Passing%20(50%20Suites)-brightgreen)]()

---

## Overview

**DocQuery** is a high-performance, multi-tenant AI document intelligence and advanced Retrieval-Augmented Generation (RAG) backend. It enables organizations to upload complex documents, process and extract text asynchronously, index vector embeddings and full-text search tokens, execute hybrid multi-modal search, generate grounded answers with deterministic citations, manage conversational histories, and evaluate retrieval/generation accuracy using an automated benchmark subsystem.

---

## System Architecture

```
                                 Client Request
                                       │
                                       ▼
                     ┌──────────────────────────────────┐
                     │     Express.js API Gateway       │
                     │  (Rate Limiting, Tracing, CORS)  │
                     └─────────────────┬────────────────┘
                                       │
                    Tenant Context & Authentication Middleware
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│ Document Ingestion│         │  Advanced RAG    │         │  Evaluation Engine   │
│  & Queue Worker  │         │     Pipeline     │         │   & Benchmarking     │
└────────┬─────────┘         └─────────┬────────┘         └──────────┬───────────┘
         │                             │                             │
         ▼                             ▼                             ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                          Core RAG Orchestration Layer                          │
│                                                                                │
│  [Query Understanding] ──► [Query Rewriting] ──► [Parallel Hybrid Retrieval]   │
│                                                          │                     │
│       ┌──────────────────────────────────────────────────┴───────────────┐     │
│       ▼                                                                  ▼     │
│  Dense Vector Search                                            Sparse Lexical │
│   (pgvector Cosine)                                            (PostgreSQL FTS)│
│       └──────────────────────────────────┬───────────────────────────────┘     │
│                                          ▼                                     │
│                            [Reciprocal Rank Fusion (RRF)]                      │
│                                          │                                     │
│                                          ▼                                     │
│                            [Score / Cohere Reranking]                          │
│                                          │                                     │
│                                          ▼                                     │
│                            [Context Selection & Budgeting]                     │
│                                          │                                     │
│                                          ▼                                     │
│                            [Grounded LLM Generation]                           │
│                      (STRICT | BALANCED | CONVERSATIONAL)                      │
│                                          │                                     │
│                                          ▼                                     │
│                            [Deterministic Citations]                           │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         Persistence & Infrastructure                           │
│                                                                                │
│   PostgreSQL + pgvector           Redis Cache & Rate Limiting        BullMQ    │
│  (Docs, Chunks, Evaluations)       (Tenant-Isolated Keys)           (Workers)  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Capabilities Across Phases

### Phase 1: Authentication & Multi-Tenancy
* Strict tenant isolation via server-side organization membership verification (`X-Organization-Id`).
* Role-Based Access Control (`OWNER`, `ADMIN`, `MEMBER`).
* Stateless short-lived JWT access tokens and database-persisted refresh tokens.

### Phase 2: Document Ingestion & Storage
* Multi-part file uploads (PDF, TXT, MD, DOCX) with magic number MIME verification.
* SHA-256 deduplication and status lifecycle tracking (`PENDING`, `PROCESSING`, `READY`, `FAILED`).

### Phase 3: Document Intelligence & Chunking
* Text extraction with line normalization, control character removal, and OCR preservation.
* Token-aware recursive sliding window chunking with configurable overlap.
* Batched embedding generation (OpenAI `text-embedding-3-small` / Mock).

### Phase 4: Semantic Search & Vector Storage
* PostgreSQL `pgvector` extension utilizing cosine distance indexing (`<=>`).
* Tenant-isolated vector similarity retrieval with configurable similarity thresholds.

### Phase 5: Grounded RAG Answer Generation
* Prompt injection defense using isolated `<<<UNTRUSTED_DOCUMENT_CONTENT>>>` boundaries.
* Deterministic citation mapping (document ID, chunk ID, page number, quotes).

### Phase 6: Conversations & Query History
* Persistent conversational threads with message history and context tracking.
* Query audit history and telemetry.

### Phase 7: Production Hardening & Observability
* Tenant-isolated Redis response caching with automatic invalidation on document updates.
* Multi-tiered rate limiters (Auth, API, RAG).
* BullMQ asynchronous background workers with retry backoff.
* Request correlation IDs (`X-Request-Id`) and structured Prometheus-compatible metrics.

### Phase 8: Advanced RAG & Evaluation
* **Query Understanding**: Intent classifier (`factual`, `summarization`, `comparison`, `procedural`, `conversational`, `ambiguous`), entity and keyword extraction.
* **Query Rewriting**: Contextual pronoun and follow-up resolution from conversational history.
* **Hybrid Retrieval & RRF**: Parallel dense semantic + sparse lexical full-text search fused with Reciprocal Rank Fusion ($k=60$).
* **Reranking Layer**: Fast local `ScoreReranker` and optional `CohereReranker`.
* **Context Selection**: Token budget optimization, chunk caps, and document diversity guarantees.
* **Answer Modes**: `STRICT` (no hallucinations), `BALANCED`, and `CONVERSATIONAL`.
* **Evaluation Subsystem**: Precision@K, Recall@K, MRR, Hit Rate, Faithfulness, Answer Relevance, Context Utilization, and comparative A/B benchmarking.

---

## API Reference

All endpoints are versioned under `/api/v1`.

### Authentication (`/api/v1/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register user & create default workspace |
| `POST` | `/auth/login` | No | Authenticate credentials & issue tokens |
| `POST` | `/auth/refresh` | No | Refresh access token |
| `POST` | `/auth/logout` | Yes | Revoke refresh token |
| `GET` | `/auth/me` | Yes | Get authenticated user profile & memberships |

### Organizations & Members (`/api/v1/organizations`)
| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| `POST` | `/organizations` | Yes | — | Create new organization |
| `GET` | `/organizations` | Yes | — | List user organizations |
| `GET` | `/organizations/:id` | Yes | Any | Get organization details |
| `GET` | `/organizations/:id/members` | Yes | Any | List organization members |
| `POST` | `/organizations/:id/members` | Yes | OWNER, ADMIN | Invite / add member |
| `PATCH` | `/organizations/:id/members/:userId` | Yes | OWNER, ADMIN | Update member role |
| `DELETE` | `/organizations/:id/members/:userId` | Yes | OWNER, ADMIN | Remove member |

### Document Management (`/api/v1/documents`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/documents/upload` | Yes | Upload document (asynchronous processing) |
| `GET` | `/documents` | Yes | List tenant documents (paginated) |
| `GET` | `/documents/:id` | Yes | Get document status & metadata |
| `DELETE` | `/documents/:id` | Yes | Delete document, chunks & invalidate cache |

### Search & RAG (`/api/v1/search`, `/api/v1/query`, `/api/v1/conversations`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/search` | Yes | Raw semantic vector similarity search |
| `POST` | `/query` | Yes | Advanced RAG question answering |
| `POST` | `/conversations` | Yes | Create conversational thread |
| `GET` | `/conversations` | Yes | List conversation threads |
| `POST` | `/conversations/:id/messages` | Yes | Send message in multi-turn conversation |

### RAG Evaluation Subsystem (`/api/v1/evaluations`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/evaluations/datasets` | Yes | Create evaluation QA dataset |
| `GET` | `/evaluations/datasets` | Yes | List tenant evaluation datasets |
| `GET` | `/evaluations/datasets/:id` | Yes | Get dataset & test cases |
| `POST` | `/evaluations/datasets/:id/cases` | Yes | Add test cases to dataset |
| `POST` | `/evaluations/runs` | Yes | Trigger evaluation run (`async: true` for BullMQ) |
| `GET` | `/evaluations/runs/:id` | Yes | Get run summary & aggregated metrics |
| `GET` | `/evaluations/runs/:id/results` | Yes | Get itemized evaluation case scores |
| `POST` | `/evaluations/benchmark` | Yes | Run comparative benchmark (Baseline vs Advanced RAG) |

---

## Getting Started

### Prerequisites
* **Node.js**: v18+ (v22 recommended)
* **PostgreSQL**: v14+ with `pgvector` extension enabled
* **Redis**: v6+ (for caching, rate limiting, and BullMQ queues)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/Dwarkesh2005/DocQuery.git
cd DocQuery

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
```

### Database Migration & Prisma Client

```bash
# Run database schema push / migrations
npx prisma db push

# Generate Prisma client
npx prisma generate
```

### Start Application

```bash
# Development mode with hot-reload
npm run dev

# Production mode
npm start
```

### Running Automated Tests

```bash
# Run all 35 test suites
npm test

# Run tests in band (recommended for clean DB teardown)
npx jest --runInBand
```

---

## Test Verification

```text
Test Suites: 35 passed, 35 total
Tests:       249 passed, 249 total
Snapshots:   0 total
Time:        21.567 s
```

---

## License

UNLICENSED — Private project.