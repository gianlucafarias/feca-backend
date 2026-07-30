# Plan 021: Automate Data Portability polling and processing

- **Priority**: P3
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: 011, 013, 017
- **Category**: product direction, async jobs

## Objective

After OAuth callback, progress an import from archive creation through download
and processing without requiring the mobile client to trigger every transition.

## Required behavior

- Enqueue an idempotent poll job after archive initiation.
- Poll with bounded exponential backoff, jitter, maximum attempts, and expiry.
- Refresh access tokens safely and never log tokens/URLs with credentials.
- On COMPLETE, enqueue processing exactly once; on FAILED/expiry, persist a safe
  terminal reason.
- Client polling remains read-only and backward compatible.
- Tests use a fake clock and cover duplicate jobs, delayed completion, expiry,
  transient Google failure, and terminal failure.

## Verification

Queue integration tests, focused service tests, full checks/build.

