# External API Resilience

## Overview
DocQuery uses a resilient HTTP client (`src/utils/http-client.js`) for all third-party and upstream communication.

## Core Resilience Patterns
1. **Timeout with AbortController**: Every request enforces a strict timeout (default: 10,000ms) to prevent slow upstream services from tying up Express connection sockets.
2. **Exponential Backoff with Full Jitter**:
   - Calculates backoff: `delay = min(baseDelay * 2^attempt + randomJitter, maxDelay)`.
   - Jitter prevents "thundering herd" retry waves from crashing recovering upstreams.
3. **Error Classification**:
   - **Transient (Retryable)**: Network drops, timeouts, HTTP 429, 500, 502, 503, 504.
   - **Permanent (Non-retryable)**: HTTP 400, 401, 403, 404, 422. Fails fast immediately.
4. **Graceful Degradation**: Optional fallback values allow non-critical dependencies to fail gracefully without failing client requests.
