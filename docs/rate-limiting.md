# Distributed Rate Limiting

## Overview
DocQuery uses a Redis-backed sliding-window rate limiting mechanism to prevent abuse, brute-force credential stuffing, and API denial-of-service.

## Rate Limiting Tiers
1. **Authentication Tier (`/api/v1/auth/*`)**
   - **Limit**: 10 requests / 15 minutes (900s)
   - **Key**: IP-based (`docquery:ratelimit:auth:ip:<ip>`)
   - **Reason**: Protects against automated password guessing and credential stuffing.
2. **General API Tier (`/api/v1/organizations/*`)**
   - **Limit**: 100 requests / 15 minutes (900s)
   - **Key**: User ID if authenticated (`docquery:ratelimit:api:user:<userId>`), IP-based otherwise.
   - **Reason**: Protects tenant resources and prevents resource exhaustion.
3. **Heavy Operations Tier**
   - **Limit**: 20 requests / 15 minutes (900s)

## HTTP Response & Headers
When the limit is exceeded, the server returns `HTTP 429 Too Many Requests` with RFC-compliant headers:
- `RateLimit-Limit`: Maximum requests permitted.
- `RateLimit-Remaining`: Requests remaining in the current window.
- `RateLimit-Reset`: Seconds until quota reset.
- `Retry-After`: Seconds the client must wait.
