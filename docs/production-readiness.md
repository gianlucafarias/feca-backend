# Production readiness

Roadmap to prepare `feca-backend` for real production: scalable, fast, observable, and cost-conscious — **without locking into a specific host**.

## Current status

| Area | Status | Notes |
|------|--------|-------|
| Tests + CI | **Done (Phase 0)** | Vitest, lib unit tests, GitHub Actions |
| Observability | **Done (Phase 1)** | JSON logs, request ID, `/health/ready`, HTTP metrics |
| Portable cache | **Done (Phase 2)** | Redis optional via `REDIS_URL` |
| God-class split | **Done (Phase 3)** | All source files ≤500 lines; facades for social/places repos and services |
| DB performance | **Done (Phase 4)** | Bounding-box geo SQL, indexes, pooling docs |
| Async jobs | **Done (Phase 5)** | pg-boss + in-process queue; push + Google import async |
| Deploy checklist | **Done (Phase 6)** | Env vars, scale triggers, provider-agnostic runbook |

Detailed task breakdown: [2026-06-12-production-readiness plan](./superpowers/plans/2026-06-12-production-readiness.md).

## Architecture principles

1. **Keep the monolith** — modular NestJS is enough until team/traffic demands otherwise.
2. **Deploy-agnostic** — Docker + Postgres + optional Redis; works on Railway, Fly, Render, Cloudflare Containers, VPS.
3. **Pay for scale when needed** — single instance can use in-memory cache; add Redis when running 2+ replicas.
4. **Observe before optimizing** — logs and health checks before micro-optimizations.

## Phases

```
Phase 0  Tests + CI              ✓ done
Phase 1  Observability           ✓ done
Phase 2  Cache / rate limit      ✓ done
Phase 3  Refactor god classes    ✓ done
Phase 4  DB + geo performance    ✓ done
Phase 5  Async jobs (pg-boss)           ✓ done
Phase 6  Deploy checklist               ✓ done
```

## Quality gates (target)

- [x] CI green on every PR (`npm run check` + `npm run test`)
- [x] ≥60% coverage on `src/lib/` (**~97%** on scoring/ranking/geo; presenters excluded)
- [x] `/health/ready` checks Postgres
- [x] JSON logs with `requestId` in production
- [x] Cache switchable: in-memory ↔ Redis via `REDIS_URL`
- [x] No source file >500 lines (goal <400)
- [x] Documented cost tiers by user stage

## Cost tiers (infra only, excl. Google API)

| Stage | Users | Est. $/month |
|-------|-------|--------------|
| Beta | <500 | $15–25 |
| Growth | 500–5k | $30–50 |
| Scale | 5k+ | $50–100 |

Google Places is usually the largest variable cost — cache aggressively and monitor request volume.

## Deploy checklist (any provider)

1. Build Docker image from root `Dockerfile`
2. Set required env vars (see `.env.example`)
3. Run `npm run prisma:migrate:deploy`
4. Start app (`node dist/main.js`)
5. Wait for `GET /health` → `200` before routing traffic
6. Optional stricter gate: `GET /health/ready` → `200` (Postgres connected)
7. Set `TRUST_PROXY=true` when behind a platform load balancer

### Required production env

```env
NODE_ENV=production
DATABASE_URL=...
AUTH_JWT_ACCESS_SECRET=...
GOOGLE_MAPS_API_KEY=...
GOOGLE_OAUTH_WEB_CLIENT_ID=...
INTERNAL_NOTIFICATIONS_SECRET=...
TRUST_PROXY=true
```

### Optional (scale / ops)

```env
# Shared cache + rate limits across replicas (required with 2+ instances)
REDIS_URL=...

# Background jobs — defaults to pg-boss in production (uses Postgres schema `pgboss`)
QUEUE_BACKEND=pg-boss

# Error tracking (optional)
SENTRY_DSN=...

# OpenTelemetry export (optional, future)
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

### Scale triggers

| Signal | Action |
|--------|--------|
| 1 instance, CPU < 60% | No change |
| CPU > 70% sustained | More RAM/CPU or second replica |
| 2+ replicas | Set `REDIS_URL` for shared cache |
| Push / import backlog | pg-boss runs in-process on each replica; monitor job latency |
| Slow nearby queries | Geo bounding box + indexes (Phase 4) |
| DB connection exhaustion | PgBouncer / pooler + Prisma `connection_limit` |

## What we are not doing (yet)

- Microservices split
- Cloudflare Workers rewrite
- Redis on day one with a single instance
- Big-bang refactor of social repository

## Running tests locally

See [Testing guide](./testing.md).

## Observability

See [Observability guide](./observability.md) for logs, request IDs, and health endpoints.

## Cache and Redis

See [Cache and Redis guide](./cache-and-redis.md).

## Database performance

See [Database performance guide](./db-performance.md) for pooling, geo queries, and indexes.

## Async jobs

See [Async jobs guide](./async-jobs.md) for push dispatch and Google import background processing.

## Provider-specific guides

- [Hetzner production](./hetzner-production.md) — **primary** self-hosted VPS (CI/CD, backups, TLS)
- [Railway production](./railway-production.md) — alternative managed deploy
