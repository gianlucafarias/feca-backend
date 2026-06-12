# Database performance

Guidelines for Postgres performance in `feca-backend` — connection pooling, geo queries, and indexes.

## Connection pooling

Prisma opens a pool per app instance. When running multiple replicas or on serverless-style hosts, use an external pooler to avoid exhausting Postgres connections.

### Recommended setup (production with 2+ instances)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled connection (PgBouncer, Neon pooler, Supabase pooler, Railway pooler) |
| `DIRECT_DATABASE_URL` | Direct Postgres URL — **migrations only** |

Append pool hints to `DATABASE_URL` when not using an external pooler:

```env
DATABASE_URL=postgresql://user:pass@host:5432/feca?connection_limit=10&pool_timeout=20
```

Typical limits:

| Instances | `connection_limit` per instance |
|-----------|----------------------------------|
| 1 | 10–15 |
| 2 | 5–8 |
| 4+ | 3–5 + external PgBouncer |

### Enable `directUrl` (optional, when using a pooler)

In `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

Locally, set both to the same URL until you add a pooler in production.

### PgBouncer notes

- Use **transaction mode** for Prisma (default recommendation).
- Run `prisma migrate deploy` against `DIRECT_DATABASE_URL`, not the pooler URL.

## Geo queries (nearby)

Nearby place lookups use a **bounding box pre-filter in SQL**, then exact haversine distance in JS on the reduced set.

| Layer | File | Role |
|-------|------|------|
| Bounds math | `src/lib/geo-bounds.ts` | `geoBoundsFromRadiusMeters`, `filterSortByDistance` |
| Places repo | `places.repository.ts` | `listNearbyPlaces*`, category/visit pools |
| Curation repo | `place-curation.repository.ts` | `listCityPickPlacesInRadius` |

Radius defaults to `GOOGLE_PLACES_RADIUS_METERS` (env, default 5000 m).

### When to consider PostGIS

Bounding box is sufficient for MVP scale (< tens of thousands of places per city). Consider PostGIS if:

- City place count > 10k and nearby p95 > 300 ms
- You need polygon regions or complex spatial joins

## Indexes (Phase 4)

| Index | Table | Supports |
|-------|-------|----------|
| `(hiddenFromApp, lat, lng)` | `Place` | Nearby bounding-box queries |
| `(userId, visitedAt DESC)` | `Visit` | Feed signals, user visit history |

Existing indexes on `Visit(userId, createdAt)`, `Place(cityId)`, feed follow graph, and notifications remain unchanged.

## Monitoring slow queries

1. Enable Postgres `log_min_duration_statement` in staging (e.g. 200 ms).
2. Use `EXPLAIN ANALYZE` on hot paths if nearby or feed latency regresses.
3. HTTP metrics + structured logs (`requestId`) correlate API latency with DB time.

## Related docs

- [Production readiness](./production-readiness.md)
- [Cache and Redis](./cache-and-redis.md)
- [Railway production](./railway-production.md)
