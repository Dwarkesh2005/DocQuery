# ============================================================
# DocQuery — Production Dockerfile
# ============================================================
# Multi-stage build for minimal production image.
# Uses dumb-init for proper signal handling (SIGTERM/SIGINT).

FROM node:24-alpine AS base

# Install dumb-init for proper PID 1 signal handling and openssl for Prisma
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

# ── Dependencies Stage ──
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Build Stage (Prisma generation) ──
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate

# ── Production Stage ──
FROM base AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy Prisma generated client from build stage
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Copy application source
COPY package.json ./
COPY prisma ./prisma/
COPY src ./src/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Ensure uploads directory exists and is owned by nodejs user
RUN mkdir -p /app/uploads && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
