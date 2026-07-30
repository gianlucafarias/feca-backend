# Plan 010: Atomically claim push deliveries

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 012
- **Category**: concurrency, notifications

## Objective

Ensure overlapping workers never send the same pending push delivery twice.

## Required behavior

- Add `claimedAt` plus UUID `claimToken` fencing (or an equivalent lease)
  without expanding the public status enum.
- Claim with one PostgreSQL statement using `FOR UPDATE SKIP LOCKED`, ordered
  deterministically and bounded to one Expo-sized batch.
- Claim a bounded batch before external Expo calls; only the claimant sends.
- Every terminal/retry update must include the current claim token and clear the
  lease. Recover stale claims using a documented timeout.
- Bound the Expo HTTP request below the lease duration.
- Preserve receipt reconciliation and permanent-failure behavior.
- Concurrent-worker integration test must prove each delivery is claimed once.
- Add stale-claim/fencing tests proving an old worker cannot overwrite the new
  claimant.
- Include the matching Prisma migration/schema update.

The guarantee is at-least-once with concurrent exclusion. Document the
unavoidable crash window after Expo accepts a send but before its ticket is
persisted; do not claim cross-system exactly-once semantics.

## Verification

Prisma validation/generation, focused DB concurrency tests, full checks/build.
