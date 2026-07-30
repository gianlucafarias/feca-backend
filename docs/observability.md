# Observability

How FECA backend exposes logs, request correlation, health checks, HTTP
metrics, queue health, and host-level launch checks.

## Structured logs

In `NODE_ENV=production`, Nest uses a JSON logger. Each line is a single JSON object:

```json
{
  "level": "info",
  "time": "2026-06-12T12:00:00.000Z",
  "service": "feca-backend",
  "msg": "http_request_completed",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "GET",
  "path": "/v1/places/nearby",
  "route": "/v1/places/nearby",
  "statusCode": 200,
  "durationMs": 142
}
```

Development and test keep the default Nest console logger for readability.

## Request correlation

Every HTTP request gets an `X-Request-Id` header:

- If the client sends `X-Request-Id`, the backend reuses it.
- Otherwise the backend generates a UUID.

The same ID appears in:

- Response header `X-Request-Id`
- Error JSON body (`requestId`)
- Structured logs for that request

Implementation: `src/common/request-context/request-context.middleware.ts` + AsyncLocalStorage.

## Health endpoints

| Endpoint | Purpose | Success | Failure |
|----------|---------|---------|---------|
| `GET /health` | Liveness alias (Railway default) | 200 | n/a |
| `GET /health/live` | Process is running | 200 | n/a |
| `GET /health/ready` | Ready for traffic | 200 + Postgres OK | 503 |

When `REDIS_URL` is set, `/health/ready` also checks Redis with `PING`.

`/health/ready` runs `SELECT 1` against Postgres via Prisma.

**Railway today:** `railway.toml` uses `/health` (liveness). That is fine for deploy. When you want deploy gates to wait for Postgres, switch to `/health/ready`.

## HTTP metrics (in-process)

`HttpMetricsInterceptor` records per-instance counters:

- Total requests
- Count by `method route statusCode`
- Duration sum / max

Health routes are excluded from request completion logs to reduce noise.

These metrics are in memory (per replica). Operators can inspect the current
instance through:

```bash
curl -fsS https://api.example.com/internal/metrics/http \
  -H "x-feca-internal-secret: $INTERNAL_NOTIFICATIONS_SECRET"
```

The endpoint fails closed without the configured internal secret. Metrics
reset when the process restarts and remain per-replica; they are useful for
launch diagnostics, not long-term retention.

## Notification pipeline health

`GET /internal/notifications/status` reports:

- queue backend, startup state, and registered worker count;
- delivery totals by status;
- pending deliveries older than 20 minutes;
- Expo tickets still unresolved after 24 hours;
- oldest pending and latest delivered timestamps.

It returns `503` when the queue is unavailable, a pending delivery is stalled,
or an Expo ticket is stale. The scheduled production workflow checks it every
10 minutes.

## Host and backup checks

The same scheduled workflow connects over SSH and runs
`deploy/hetzner/scripts/check-host-health.sh`. It fails when:

- backend, Caddy, or Postgres is not running;
- disk usage reaches `DISK_MAX_PERCENT` (85 by default);
- no backup exists;
- the latest backup is empty, corrupt, or older than
  `BACKUP_MAX_AGE_HOURS` (30 by default).

GitHub Actions notifications must be enabled for the repository owners so a
failed workflow becomes an operator alert.

## Remaining external integration

Production crash reporting and searchable log retention require an external
provider such as Sentry or a log collector. They are not marked configured
until a real account, retention policy, and alert recipient are verified.

## Error logging

`AllExceptionsFilter` logs structured errors for:

- Unhandled exceptions (500)
- HTTP exceptions with status ≥ 500

4xx responses are returned to the client without error-level logs.

Stack traces are included in logs only outside production.

## Related docs

- [Production readiness](./production-readiness.md)
- [Railway production](./railway-production.md)
- [Testing](./testing.md)
