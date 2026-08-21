# Redis Infrastructure

## Overview
Redis is an in-memory key-value data store used in DocQuery for high-throughput, low-latency caching, distributed rate limiting, and background queue broker storage.

## Architecture
- **Client**: `ioredis` singleton instance initialized in `src/config/redis.js`.
- **Reconnection Strategy**: Exponential backoff up to 5000ms with automatic reconnection on failover `READONLY` errors.
- **Fail-Open Resilience**: All operations in `src/services/redis.service.js` catch errors and return null/false rather than crashing the HTTP server.

## Abstractions (`src/services/redis.service.js`)
- `buildKey(...parts)`: Namespaces keys with `docquery:` prefix (e.g. `docquery:cache:org:123`).
- `get(key)`: Retrieves and parses JSON value.
- `set(key, value, ttlSeconds)`: Serializes and stores value with optional expiration.
- `del(...keys)`: Removes one or more keys.
- `delPattern(pattern)`: Non-blocking pattern deletion using Redis `SCAN` cursor.
- `exists(key)`: Checks key existence.
- `expire(key, ttlSeconds)`: Sets key expiry.
- `increment(key, ttlSeconds)`: Atomically increments counter and sets TTL on creation via multi-exec pipeline.
