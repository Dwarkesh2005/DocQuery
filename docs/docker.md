# Docker Infrastructure

## Architecture
DocQuery is containerized using a multi-stage Docker build and managed locally via Docker Compose.

```
                  ┌──────────────────────┐
                  │    docker-compose    │
                  └──────────┬───────────┘
                             │
     ┌───────────────┬───────┴───────┬───────────────┐
     ▼               ▼               ▼               ▼
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│   App   │     │ Worker  │     │ Postgres│     │  Redis  │
│ (Node)  │     │(BullMQ) │     │  (v16)  │     │  (v7)   │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

## Dockerfile Design
- **Base Image**: `node:24-alpine` for minimal surface area (<150MB).
- **Process Manager**: `dumb-init` runs as PID 1 to proxy `SIGTERM`/`SIGINT` signals to Node.
- **Security**: Runs under non-root user `nodejs` (UID 1001).

## Running with Docker Compose
```bash
docker compose up -d
docker compose logs -f app
```
