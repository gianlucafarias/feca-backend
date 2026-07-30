# Plan 014: Optimize notification automation queries

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: 012
- **Category**: performance

## Objective

Replace O(users) and N+1 reminder scans with bounded, indexed, set-based work.

## Required behavior

- Move due-user/event/visit selection into repository queries.
- Process deterministic batches with a continuation cursor.
- Add missing composite/partial indexes used by due, status, and sent checks;
  keep `schema.prisma` and migrations aligned.
- Make each reminder creation idempotent.
- Add query-count/batch-bound tests and `EXPLAIN` evidence in docs.

## Verification

Migration validation, focused DB tests, full checks/build.

