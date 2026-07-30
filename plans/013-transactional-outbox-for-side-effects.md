# Plan 013: Make writes and side effects idempotent

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 008, 010, 012
- **Category**: data integrity, architecture

## Objective

Prevent successful domain writes from returning errors because notification or
queue publication failed, and prevent duplicate side effects on retry.

## Required behavior

- Inventory write-then-publish commands (visits, follows, groups, events).
- Persist an outbox record in the same transaction as each domain write.
- Dispatch asynchronously with an idempotency key and retry/backoff policy.
- Domain APIs return based on committed domain state, not transient push health.
- Tests prove commit+enqueue atomicity, retry safety, and no duplicate
  notification rows.

## Verification

Migration checks, DB integration tests, queue tests, full checks/build.

