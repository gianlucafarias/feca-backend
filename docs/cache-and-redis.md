# Cache and Redis

FECA can run with **in-memory cache and rate limits** (single instance) or switch to **Redis** for horizontal scaling without code changes.

## When to enable Redis

| Scenario | Redis |
|----------|-------|
| 1 instance, MVP / beta | Optional |
| 2+ app replicas | Recommended |
| Shared Google Places cache across nodes | Recommended |
| Consistent rate limits across nodes | Recommended |

## Configuration

Add to environment:

```env
REDIS_URL=redis://localhost:6379
```

Works with managed providers (Upstash, Railway Redis, Redis Cloud, etc.).

Without `REDIS_URL`:

- Nest cache stays in-memory
- Rate limiting is per instance
- Single-flight deduplication is per instance

## What Redis enables

1. **Shared cache** — `@nestjs/cache-manager` backed by `@keyv/redis` (`namespace: feca`)
2. **Distributed rate limits** — `@nest-lab/throttler-storage-redis`
3. **Distributed single-flight** — avoids duplicate Google Places calls across replicas while a cache miss is in progress

## Health checks

`GET /health/ready` verifies:

- Postgres (`SELECT 1`)
- Redis (`PING`) — only when `REDIS_URL` is set

## Admin override persistence

Preview admin flags (`PATCH /v1/me/admin`) are stored in Postgres as `User.isAdminOverride` instead of in-memory state.

Email-based admins (`FECA_ADMIN_EMAILS`) are unchanged.

## Related docs

- [Production readiness](./production-readiness.md)
- [Observability](./observability.md)
