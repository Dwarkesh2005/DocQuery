# Security Hardening

## Defense-in-Depth Measures
1. **Prototype Pollution Protection**: `sanitizeInput` middleware traverses request bodies, query parameters, and route parameters to strip `__proto__`, `constructor`, and `prototype` keys.
2. **HTTP Security Headers (Helmet)**:
   - Enforces HTTP Strict Transport Security (HSTS) with 1-year max-age and subdomains preload.
   - Disables MIME type sniffing (`X-Content-Type-Options: nosniff`).
   - Prevents clickjacking (`X-Frame-Options: SAMEORIGIN`).
3. **CORS Policy**: Configures origin whitelist, allowed headers (`X-Organization-Id`, `X-Request-Id`), and exposed headers for client inspection.
4. **Rate Limiting**: Distributed sliding-window rate limiters prevent brute force attacks on authentication.
5. **Multi-Tenant Isolation**: Server-side role checks (`resolveOrganization`, `requireRole`) prevent cross-tenant IDOR and unauthorized elevation.
