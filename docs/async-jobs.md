# Async jobs

Background job queue for work that should not block HTTP requests — push dispatch and Google Data imports.

## Backends

| Backend | When | Cost |
|---------|------|------|
| `in-process` | Default in development and test (`NODE_ENV` ≠ production) | $0 |
| `pg-boss` | Default in production (uses existing Postgres) | $0 extra |

Override with:

```env
QUEUE_BACKEND=in-process   # force in-process
QUEUE_BACKEND=pg-boss      # force pg-boss (creates schema `pgboss`)
```

pg-boss tables are created automatically on app startup when `pg-boss` is enabled.

## Job types

| Job | Trigger | Worker |
|-----|---------|--------|
| `feca.push.dispatch` | `NotificationsService.publish` when push deliveries are created | `PushDispatchWorker` |
| `feca.google-import.process-archive` | `POST .../process-archive` (202) | `GoogleDataImportWorker` |
| `feca.google-import.ingest-saved` | `POST .../saved-collections` (202) | `GoogleDataImportWorker` |
| `feca.google-import.retry` | `POST .../retry` (202) | `GoogleDataImportWorker` |

Push dispatch uses `singletonKey: push-dispatch` so multiple notifications in a burst coalesce into one dispatch run.

## HTTP behaviour

### Push

Creating a notification with push deliveries enqueues dispatch immediately. The API response is unchanged; push sending happens in the background (target: <50 ms added to the request).

The internal cron endpoints remain as fallback:

- `POST /internal/notifications/dispatch`
- `POST /internal/notifications/receipts`

### Google Data import

Heavy endpoints return **202 Accepted** with a job id:

```json
{
  "jobId": "uuid",
  "import": { "...": "..." }
}
```

Poll `GET /v1/me/google-data-imports/:id` until `status` is `complete` or `failed`.

## Architecture

```
src/infrastructure/queue/
  queue.module.ts      # Global Nest module
  queue.service.ts     # enqueue + pg-boss / in-process
  queue.types.ts       # job names and payloads

src/social/
  push-dispatch.worker.ts

src/google-data-portability/
  google-data-import.worker.ts
```

Workers register handlers in their constructor before `QueueService.onModuleInit()` starts pg-boss workers.

## Related docs

- [Production readiness](./production-readiness.md)
- [Database performance](./db-performance.md) — pg-boss uses Postgres
