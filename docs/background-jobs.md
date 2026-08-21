# Background Jobs & Queue Processing (BullMQ)

## Overview
Asynchronous background processing offloads heavy or non-critical operations from the HTTP request-response cycle, preserving sub-50ms API response times.

## Queues
1. **`docquery:audit`**: Asynchronous auditing for security and compliance events (workspace creations, member role changes).
2. **`docquery:notification`**: Email/invitation delivery to users.
3. **`docquery:document`**: Heavy document intelligence analysis, embeddings generation, and vector index updates.

## Reliability & Failure Handling
- **Delivery Guarantee**: At-least-once delivery with idempotent handlers.
- **Retry Strategy**: 5 attempts with exponential backoff (`delay: 1000ms * 2^(attempt)`).
- **Dead-Letter Storage**: Failed jobs are retained (`removeOnFail: 5000`) for developer inspection.
- **Deduplication**: Idempotent deterministic job IDs prevent duplicate processing on retries.
