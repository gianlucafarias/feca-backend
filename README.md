# FECA Backend

Production-oriented NestJS API for FECA's mobile application. It owns
authentication, places, visits, saves, social feeds, follows, groups, diaries,
notifications, push delivery, and Google Data Portability imports.

## Status

The backend has automated type checking, tests, coverage thresholds, production
builds, dependency auditing, container builds, migrations, readiness checks,
and a Hetzner deployment runbook. Current launch requirements and external
gates are tracked in [Production readiness](./docs/production-readiness.md).

## Stack

- Node.js 22, NestJS, and Express
- PostgreSQL and Prisma
- pg-boss for durable background jobs
- Optional Redis for shared cache and distributed rate limiting
- Docker Compose and Caddy on Hetzner
- Vitest

## Local setup

Requirements: Node.js 22 or newer, npm, and Docker.

```bash
git clone https://github.com/gianlucafarias/feca-backend.git
cd feca-backend
npm ci
cp .env.example .env
npm run db:up
npm run prisma:migrate:deploy
npm run start:dev
```

Use development-only credentials in `.env`. Never commit database URLs,
service-account files, OAuth secrets, JWT secrets, or production exports.

## Quality gates

```bash
npm run check
npm test
npm run test:coverage
npm run release:check
```

`release:check` runs type checking, the complete test suite, coverage, the exact
production build, and the production dependency audit.

## Runtime endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health/live` | Process liveness |
| `GET /health/ready` | PostgreSQL and optional Redis readiness |
| `GET /internal/metrics/http` | Secured per-instance HTTP metrics |
| `GET /internal/notifications/status` | Secured queue and push-delivery health |

Internal endpoints require `x-feca-internal-secret`.

## Architecture

The API is a modular monolith. PostgreSQL remains the source of truth and
pg-boss runs durable jobs in the same database. Redis is intentionally optional
for one instance and becomes required before horizontal scaling.

See:

- [Architecture](./docs/architecture.md)
- [Mobile API specification](./docs/mobile-api-spec.md)
- [Social graph](./docs/social-graph.md)
- [Async jobs](./docs/async-jobs.md)
- [Cache and Redis](./docs/cache-and-redis.md)
- [Database performance](./docs/db-performance.md)

## Production operations

Hetzner is the primary deployment target:

- [Hetzner production runbook](./docs/hetzner-production.md)
- [Observability](./docs/observability.md)
- [Testing](./docs/testing.md)
- [Production readiness](./docs/production-readiness.md)

The deployment uses Caddy for TLS, Docker Compose for the application stack,
daily verified PostgreSQL backups, and scheduled external health checks.

## Security

See [SECURITY.md](./SECURITY.md). Do not report vulnerabilities or leaked
credentials in a public issue.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Copyright © 2026 Gianluca Palmier. All rights reserved. See
[LICENSE](./LICENSE). Public source visibility does not grant permission to
copy, redistribute, or create derivative works.
