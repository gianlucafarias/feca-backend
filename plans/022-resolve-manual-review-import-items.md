# Plan 022: Resolve manual-review import items

- **Priority**: P3
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: 013, 017, 019
- **Category**: product direction, API

## Objective

Let the import owner resolve `manual_review` items to a canonical place or skip
them, with an auditable and idempotent API.

## Required behavior

- Owner-only list/filter endpoint for manual-review items with bounded
  pagination.
- Owner-only resolve action accepting canonical `placeId` or Google Place ID,
  plus an explicit skip action.
- Validate item/import ownership and mutable status.
- Reuse canonical Place ID normalization and existing place resolution.
- Apply the saved/visited domain effect once, then transition the item in one
  transaction/outbox flow.
- Add HTTP/DB authorization, idempotency, invalid-transition, and pagination
  tests; document the mobile contract.

## Verification

Focused HTTP/DB tests, `npm run check`, full tests/build.

