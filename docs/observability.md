# Observability

How FECA backend exposes logs, request correlation, health checks, and basic HTTP metrics.

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

These metrics are in memory (per replica). Export to Prometheus/Datadog is planned when needed.

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
