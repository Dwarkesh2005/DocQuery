# DocQuery — Production Architecture & Reliability

```
                              Internet Traffic (HTTPS)
                                         │
                                         ▼
                      ┌─────────────────────────────────────┐
                      │   Cloud Load Balancer / TLS Proxy   │
                      │  (WAF, DDoS Shield, SSL 1.3 Term)   │
                      └──────────────────┬──────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │   DocQuery API Node 1   │                 │   DocQuery API Node 2   │
      │  (Express, Auth, RAG)   │                 │  (Express, Auth, RAG)   │
      └────────────┬────────────┘                 └────────────┬────────────┘
                   │                                           │
                   └─────────────────────┬─────────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
│ PostgreSQL 16 Primary  │   │     Redis 7 Cluster    │   │  BullMQ Worker Cluster │
│  (pgvector, Read/Write │   │   (AOF Persistence,    │   │  (Idempotent Chunks,   │
│   Transactions, WAL)   │   │  Cache, Distributed LK)│   │  Embeddings, Workers)  │
└────────────────────────┘   └────────────────────────┘   └────────────────────────┘
```

## Service Level Objectives (SLOs) & SLIs

| Metric (SLI) | Target (SLO) | Measurement Method | Sustained Alert Threshold |
|---|---|---|---|
| **API Availability** | $\ge 99.95\%$ | `GET /health/ready` success | $< 99.9\%$ over 5 min |
| **P95 RAG Query Latency** | $< 1200\text{ ms}$ | `http_request_duration_ms` | $> 2000\text{ ms}$ over 5 min |
| **P95 Search Latency** | $< 250\text{ ms}$ | `rag_retrieval_duration_ms`| $> 500\text{ ms}$ over 5 min |
| **Worker Processing Error Rate** | $< 0.1\%$ | `worker_jobs_total{status="failed"}` | $> 1\%$ over 10 min |
| **Dead-Letter Queue Volume** | $0\text{ persistent}$ | DLQ growth counter | $> 5$ records in 15 min |
