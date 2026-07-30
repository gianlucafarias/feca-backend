# Production readiness

Roadmap to prepare `feca-backend` for real production: scalable, fast, observable, and cost-conscious — **without locking into a specific host**.

## Current status

| Area | Status | Notes |
|------|--------|-------|
| Tests + CI | **Done (Phase 0)** | Typecheck, tests, coverage, build, dependency audit and Docker build |
| Observability | **Launch baseline done** | JSON logs, request ID, readiness, secured metrics, push/host/backup checks; external crash/log provider remains a gate |
| Portable cache | **Done (Phase 2)** | Redis optional via `REDIS_URL` |
| God-class split | **Done (Phase 3)** | All source files ≤500 lines; facades for social/places repos and services |
| DB performance | **Done (Phase 4)** | Bounding-box geo SQL, indexes, pooling docs |
| Async jobs | **Done (Phase 5)** | pg-boss + in-process queue; push + Google import async; stalled delivery detection |
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

- [x] CI green on every PR (`npm run release:check` + production Docker build)
- [x] Release gate builds the exact `dist/main.js` artifact and audits production dependencies
- [x] ≥60% coverage on `src/lib/` (**~97%** on scoring/ranking/geo; presenters excluded)
- [x] `/health/ready` checks Postgres
- [x] JSON logs with `requestId` in production
- [x] Secured per-instance HTTP metrics endpoint
- [x] External scheduled checks for API, queue, containers, disk, and backups
- [x] Cache switchable: in-memory ↔ Redis via `REDIS_URL`
- [x] No source file >500 lines (goal <400)
- [x] Documented cost tiers by user stage

## Cost tiers (infra only, excl. Google API)

| Stage | Users | Infra shape | Est. $/month |
|-------|-------|-------------|------------------|
| Beta | <500 | Current 2 vCPU / 4 GB VPS + optional snapshot | $10–25 |
| Growth | 500–5k | Larger VPS or second app replica + Redis/offsite backup | $30–70 |
| Scale | 5k+ | Multiple app replicas, managed/pooler DB, external observability | $75+ |

The current Hetzner server reports **$9.49/month** before snapshots, backup
storage, taxes, or traffic overages (verified 2026-07-30). Google Places is the
largest variable application cost and is not included above. Configure a
Google Cloud billing budget and API quota alert before public promotion; cache
and per-user rate limits reduce usage but are not a spending cap.

## Deploy checklist (any provider)

1. Run `npm run release:check`
2. Build Docker image from root `Dockerfile`
3. Set required env vars (see `.env.example`)
4. Take and verify a database backup
5. Run `npm run prisma:migrate:deploy`
6. Start app (`node dist/main.js`)
7. Require `GET /health/ready` → `200` before routing traffic
8. Set `TRUST_PROXY=true` when behind a platform load balancer

Production migrations must be backward-compatible with the previous
application image. The Hetzner deploy script automatically restores that image
when the new container fails readiness, but it intentionally does not attempt
to reverse a database migration.

### Required production env

```env
NODE_ENV=production
DATABASE_URL=...
AUTH_JWT_ACCESS_SECRET=...
AUTH_JWT_ISSUER=feca-backend
AUTH_JWT_AUDIENCE=feca-app
GOOGLE_MAPS_API_KEY=...
GOOGLE_OAUTH_WEB_CLIENT_ID=...
INTERNAL_NOTIFICATIONS_SECRET=...
TRUST_PROXY=true
```

Production validation requires JWT and internal-job secrets of at least 32
characters. Browser origins, when configured, must be explicit HTTPS origins;
native clients without an `Origin` header remain supported.

### Optional (scale / ops)

```env
# Shared cache + rate limits across replicas (required with 2+ instances)
REDIS_URL=...

# Background jobs — defaults to pg-boss in production (uses Postgres schema `pgboss`)
QUEUE_BACKEND=pg-boss
```

Google Data Portability remains disabled unless all four values are configured:

```env
GOOGLE_DATA_PORTABILITY_CLIENT_ID=...
GOOGLE_DATA_PORTABILITY_CLIENT_SECRET=...
GOOGLE_DATA_PORTABILITY_REDIRECT_URI=https://api.example.com/v1/google-data-imports/oauth/callback
GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY=...
```

The token encryption key must be independent from the JWT key so JWT rotation
does not make stored Google tokens unreadable.

### Scale triggers

| Signal | Action |
|--------|--------|
| 1 instance, CPU < 60% | No change |
| CPU > 70% sustained | More RAM/CPU or second replica |
| 2+ replicas | Set `REDIS_URL` for shared cache |
| Push / import backlog | pg-boss runs in-process on each replica; monitor job latency |
| Slow nearby queries | Geo bounding box + indexes (Phase 4) |
| DB connection exhaustion | PgBouncer / pooler + Prisma `connection_limit` |

The current single CPX22 (2 vCPU, 4 GB) is the beta launch topology. It is not
highly available: a host outage causes downtime. Horizontal scaling is a
measured response, not a launch prerequisite, but it requires Redis for shared
cache/rate limits and a load balancer before adding a second app replica.

### External launch gates

- Configure `PRODUCTION_INTERNAL_SECRET` in GitHub Actions to match the server.
- Enable GitHub Actions failure notifications for the production operators.
- Configure a Google Cloud billing budget and Places quota alerts.
- Verify APNs/FCM credentials with one physical iOS and Android device.
- Choose and configure crash reporting/searchable log retention, or explicitly
  accept reduced diagnostic capability for the closed beta.
- Keep at least one backup copy outside the VPS (Hetzner snapshot or object
  storage) and perform a restore drill.

## What we are not doing (yet)

- Microservices split
- Cloudflare Workers rewrite
- Redis on day one with a single instance
- Big-bang refactor of social repository

## Running tests locally

See [Testing guide](./testing.md).

The complete local/CI gate is:

```bash
npm run release:check
```

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
