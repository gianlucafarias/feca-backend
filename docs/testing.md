# Testing

FECA backend uses [Vitest](https://vitest.dev/) for unit and integration tests.

## Quick start

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```

Coverage (focused on `src/lib/`):

```bash
npm run test:coverage
```

## Layout

| Path | Purpose |
|------|---------|
| `src/lib/__tests__/*.spec.ts` | Pure logic tests (geo, ranking, scoring, tags) |
| `test/integration/*.spec.ts` | NestJS wiring and env validation |

Integration tests do **not** require a running database today. They mock dependencies or validate config parsing only.

## Local env for tests

Copy the test env template if you add DB-backed integration tests later:

```bash
cp .env.test.example .env.test
```

CI runs `npm run check`, `npm run test`, and `npm run test:coverage` on every push/PR to `main`.

## What to test first

When changing behavior, prefer tests in this order:

1. **`src/lib/`** — ranking, scoring, geo, normalization (fast, no I/O)
2. **Env validation** — `validateEnv` production rules
3. **Controllers** — health and critical auth flows (with mocks)
4. **Repositories** — only for complex queries (needs test Postgres)

## Related docs

- [Production readiness](./production-readiness.md) — roadmap and quality gates
- [Observability](./observability.md) — logs, request IDs, health endpoints
- [Implementation plan](./superpowers/plans/2026-06-12-production-readiness.md) — detailed phase breakdown
