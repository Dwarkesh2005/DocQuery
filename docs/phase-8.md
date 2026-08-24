# Phase 8 — Advanced RAG & Evaluation

## Overview

Phase 8 elevates DocQuery into an advanced, observable, measurable RAG platform. It introduces hybrid retrieval (dense semantic + sparse lexical full-text search), Reciprocal Rank Fusion (RRF), cross-score reranking, contextual query rewriting, dynamic answer modes, and an automated evaluation subsystem for benchmarking retrieval and generation performance.

---

## Key Features

1. **Query Understanding & Intent Classification**
   - Automatically detects query intent: `factual`, `summarization`, `comparison`, `procedural`, `conversational`, `ambiguous`.
   - Extracts quotes, section identifiers, and key search terms.
   - Decides if contextual rewriting is required.

2. **Query Rewriting & Context Resolution**
   - Resolves multi-turn conversational context, pronouns, and follow-up questions into standalone queries.
   - Non-destructive: preserves the user's original message in conversation records.
   - Safe fallback to the original query on error or timeout.

3. **PostgreSQL Full-Text Search (Lexical)**
   - Native PostgreSQL `to_tsvector('english', content)` and `plainto_tsquery('english', query)` search.
   - Scored with `ts_rank`.
   - 100% tenant-isolated (`d.organization_id = $organizationId::uuid`).

4. **Reciprocal Rank Fusion (RRF)**
   - Fuses ranked lists from vector search and keyword search.
   - Formula: $RRF(d) = \sum_{m \in M} \frac{1}{k + \text{rank}_m(d)}$ with default $k = 60$.
   - Automatically promotes chunks retrieved across both modalities.

5. **Reranker Layer**
   - **`ScoreReranker`**: Built-in, high-speed lexical-density and position heuristic reranker. Zero API keys, zero additional latency.
   - **`CohereReranker`**: Provider for Cohere Rerank API with automatic fallback to `ScoreReranker` if unconfigured.

6. **Context Selection & Token Budgeting**
   - Hard bound on candidate chunks (`maxChunks`, default: 10).
   - Strict token context limit (`maxTokens`, default: 3000).
   - Deduplication of identical content and chunk IDs.
   - Document diversity preservation.

7. **Answer Modes**
   - `STRICT`: Strict adherence to provided document context; explicitly refuses to speculate on missing information.
   - `BALANCED`: Standard enterprise grounded reasoning and synthesis.
   - `CONVERSATIONAL`: Natural multi-turn assistant persona with full citation grounding.

8. **RAG Evaluation Subsystem**
   - **Datasets & Test Cases**: CRUD APIs for evaluation datasets and ground-truth QA cases.
   - **Evaluation Runs**: Asynchronous (BullMQ) or synchronous execution of datasets against the RAG pipeline.
   - **Information Retrieval Metrics**: Precision@K, Recall@K, Mean Reciprocal Rank (MRR), Hit Rate.
   - **Generation Metrics**: Answer Relevance, Faithfulness (Groundedness), Context Utilization.
   - **Comparative Benchmarking**: Benchmark baseline RAG vs Advanced RAG and return delta improvements.

---

## API Endpoints

### Query API (Enhanced)
* `POST /api/v1/query`
  * Body parameters:
    * `query`: string (required)
    * `topK`: number (optional)
    * `documentId`: UUID (optional)
    * `threshold`: number (optional)
    * `answerMode`: `'STRICT' | 'BALANCED' | 'CONVERSATIONAL'` (optional)
    * `enableHybrid`: boolean (optional)
    * `enableReranking`: boolean (optional)

### Evaluation APIs
* `POST /api/v1/evaluations/datasets` — Create evaluation dataset with test cases.
* `GET /api/v1/evaluations/datasets` — List tenant datasets (paginated).
* `GET /api/v1/evaluations/datasets/:id` — Get dataset with test cases.
* `DELETE /api/v1/evaluations/datasets/:id` — Delete dataset.
* `POST /api/v1/evaluations/datasets/:id/cases` — Add test cases to dataset.
* `POST /api/v1/evaluations/runs` — Trigger evaluation run (`async: true` for BullMQ).
* `GET /api/v1/evaluations/runs` — List evaluation runs.
* `GET /api/v1/evaluations/runs/:id` — Get run summary and aggregated metrics.
* `GET /api/v1/evaluations/runs/:id/results` — Get itemized test case results.
* `POST /api/v1/evaluations/benchmark` — Run comparative benchmark (Baseline vs Advanced).

---

## Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ENABLE_HYBRID_SEARCH` | boolean | `true` | Enable parallel vector + keyword retrieval |
| `ENABLE_QUERY_REWRITE` | boolean | `true` | Enable conversational query rewriting |
| `ENABLE_RERANKING` | boolean | `true` | Enable candidate reranking |
| `RERANKER_PROVIDER` | string | `score` | Reranker provider (`score` \| `cohere`) |
| `COHERE_API_KEY` | string | `""` | Optional API key for Cohere Rerank |
| `RRF_K_CONSTANT` | number | `60` | Smoothing constant $k$ for RRF fusion |
| `DEFAULT_ANSWER_MODE` | string | `STRICT` | Default answer mode (`STRICT` \| `BALANCED` \| `CONVERSATIONAL`) |
