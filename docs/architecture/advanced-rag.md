# Advanced RAG & Evaluation Architecture

This document details the architecture, design principles, mathematical foundations, and component interactions of the DocQuery Phase 8 Advanced RAG & Evaluation system.

---

## 1. Pipeline Architecture

```
User Query
    │
    ▼
[ Query Understanding ] ─── Intent Detection, Keywords, Named Entities
    │
    ▼
[ Query Rewriting ] ─────── Multi-Turn Context Resolution & Expansion
    │
    ├─── Parallel Retrieval ───────────────────────────┐
    │                                                  │
    ▼                                                  ▼
[ Dense Vector Search ]                      [ Sparse Lexical Search ]
 (pgvector Cosine Distance)                 (PostgreSQL Full-Text Search)
    │                                                  │
    └──────────────────────┬───────────────────────────┘
                           ▼
              [ Reciprocal Rank Fusion (RRF) ]
               Fuses & Deduplicates Candidates
                           │
                           ▼
                 [ Relevance Reranking ]
                  (ScoreReranker / Cross-Encoder)
                           │
                           ▼
              [ Context Selection & Budgeting ]
               Token Limits, Chunk Bounds, Diversity
                           │
                           ▼
             [ Grounded LLM Answer Generation ]
         (Modes: STRICT | BALANCED | CONVERSATIONAL)
                           │
                           ▼
             [ Deterministic Citation Validation ]
                           │
                           ▼
          [ Telemetry, Logging & Redis Caching ]
```

---

## 2. Mathematical Foundations

### 2.1 Reciprocal Rank Fusion (RRF)

Reciprocal Rank Fusion integrates ranked candidate lists from disparate retrieval modalities (dense vector search and sparse lexical search) into a single calibrated ranking without requiring normalized score calibration.

$$\text{RRF}(d) = \sum_{m \in M} \frac{1}{k + \text{rank}_m(d)}$$

Where:
* $M$: Set of retrieval modalities $\{ \text{Vector}, \text{Keyword} \}$
* $\text{rank}_m(d)$: 1-indexed rank of document/chunk $d$ in retriever $m$
* $k$: Smoothing constant preventing top-ranked items from dominating disproportionately (default: $k = 60$)

### 2.2 Evaluation Metrics

#### Retrieval Metrics
* **Precision@K**:
  $$\text{Precision@K} = \frac{|\text{Retrieved Top-K} \cap \text{Expected Relevant Sources}|}{\min(K, |\text{Retrieved Chunks}|)}$$

* **Recall@K**:
  $$\text{Recall@K} = \frac{|\text{Retrieved Top-K} \cap \text{Expected Relevant Sources}|}{|\text{Expected Relevant Sources}|}$$

* **Mean Reciprocal Rank (MRR)**:
  $$\text{MRR} = \frac{1}{|Q|} \sum_{i=1}^{|Q|} \frac{1}{\text{rank}_i}$$
  where $\text{rank}_i$ is the rank position of the first relevant document for query $i$.

* **Hit Rate**:
  $$\text{Hit Rate} = \begin{cases} 1 & \text{if } |\text{Retrieved Top-K} \cap \text{Expected Relevant Sources}| > 0 \\ 0 & \text{otherwise} \end{cases}$$

#### Generation Metrics
* **Faithfulness / Groundedness**: Fraction of claims in the generated response directly supported by retrieved context without hallucination $[0.0, 1.0]$.
* **Answer Relevance**: Semantic alignment between the generated answer and the original question $[0.0, 1.0]$.
* **Context Utilization**: Ratio of retrieved context chunks actually referenced or utilized in the generated output $[0.0, 1.0]$.

---

## 3. Component Details

| Component | File Path | Responsibilities |
|---|---|---|
| **Query Understanding** | `src/modules/query/services/query-understanding.service.js` | Intent classification, entity and keyword extraction, rewriting necessity. |
| **Query Rewriting** | `src/modules/query/services/query-rewriting.service.js` | Resolves anaphoric references from conversation history into standalone queries. |
| **Keyword Search** | `src/modules/search/services/keyword-search.service.js` | Native PostgreSQL full-text search (`to_tsvector` + `plainto_tsquery`) with tenant isolation. |
| **Hybrid Search** | `src/modules/search/services/hybrid-search.service.js` | Coordinates concurrent vector and keyword retrieval with automatic fallback. |
| **RRF Fusion** | `src/modules/search/services/rrf.service.js` | Applies $RRF(d) = \sum \frac{1}{k + rank(d)}$ fusion. |
| **Rerankers** | `src/modules/query/rerankers/` | `ScoreReranker` (local zero-cost heuristic) & `CohereReranker` (cross-encoder) provider abstraction. |
| **Context Selection** | `src/modules/query/services/context-selector.service.js` | Enforces chunk limits, token context budget, and deduplication. |
| **Query Service** | `src/modules/query/query.service.js` | Orchestrates the entire RAG pipeline with answer modes and prompt injection defense. |
| **Evaluation Subsystem** | `src/modules/evaluations/` | Datasets, test cases, evaluation runs, metrics calculation, and benchmarking. |
| **Background Worker** | `src/workers/evaluation.worker.js` | BullMQ worker for asynchronous batch evaluation execution. |

---

## 4. Tenant Isolation & Security Guarantees

1. **Strict Partitioning**: Every database query across vector search, keyword search, datasets, test cases, and evaluation runs is filtered by `organization_id = $organizationId::uuid`.
2. **Untrusted Content Boundaries**: Document content injected into prompts is strictly enclosed inside `<<<UNTRUSTED_DOCUMENT_CONTENT>>>` tags with explicit security rules prohibiting instruction following.
3. **No Paid Provider Dependency**: The system operates with zero external paid dependencies by default, utilizing PostgreSQL FTS, local vector cosine similarity, and `ScoreReranker`.
