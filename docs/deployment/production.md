# DocQuery — Production Deployment Guide

## 1. Overview
DocQuery is designed for high availability, zero-downtime rolling upgrades, and horizontal scalability across containerized environments (Docker Swarm, Kubernetes, Amazon ECS).

---

## 2. Infrastructure Prerequisites

* **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / Alpine)
* **Node.js**: v22+ or Docker 24+
* **PostgreSQL**: PostgreSQL 16+ with `pgvector` extension enabled
* **Redis**: Redis 7+ with persistent AOF enabled
* **Reverse Proxy**: Nginx, Traefik, or AWS ALB with TLS 1.3 termination

---

## 3. Zero-Downtime Deployment Flow

```
1. Build & Push Immutable Docker Image (e.g. docquery:v1.5.0)
                       ↓
2. Apply Backward-Compatible Database Migrations (npx prisma migrate deploy)
                       ↓
3. Start New Container Replicas
                       ↓
4. Poll Readiness Probes (GET /health/ready until 200 OK)
                       ↓
5. Shift Traffic at Reverse Proxy / Load Balancer
                       ↓
6. Drain In-Flight Requests on Old Replicas (SIGTERM with 15s timeout)
                       ↓
7. Terminate Old Containers
```

---

## 4. Reverse Proxy Configuration (Nginx Example)

```nginx
upstream docquery_api {
    server 127.0.0.1:3001 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.docquery.io;

    ssl_certificate /etc/letsencrypt/live/api.docquery.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.docquery.io/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Client payload limit (20MB for document uploads)
    client_max_body_size 25M;

    location / {
        proxy_pass http://docquery_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 5s;
    }
}
```

---

## 5. Scaling Recommendations

| Tier | API Replicas | Worker Replicas | PostgreSQL CPU/RAM | Redis CPU/RAM | Concurrent Users |
|---|---|---|---|---|---|
| **Starter** | 2 | 2 | 2 vCPU / 4 GB | 1 vCPU / 2 GB | Up to 2,500 |
| **Growth** | 4 | 4 | 4 vCPU / 8 GB | 2 vCPU / 4 GB | Up to 10,000 |
| **Enterprise**| 8+ | 8+ | 8 vCPU / 32 GB | 4 vCPU / 16 GB | 50,000+ |
