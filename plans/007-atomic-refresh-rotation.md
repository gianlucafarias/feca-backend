# Plan 007: Make refresh-token rotation atomic

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 012
- **Category**: authentication, concurrency

## Objective

Make concurrent use of one refresh token yield exactly one replacement session.

## Required behavior

- Replace read-then-revoke rotation with one transactional/conditional consume
  operation whose affected-row count is authoritative.
- Create the replacement session only when the old active, unexpired session
  was consumed in that same transaction.
- Losers receive the existing invalid-token response and create no session.
- Keep logout idempotent.
- Add a real-DB concurrent integration test plus service tests for expired and
  revoked sessions.
- No JWT/API response changes.

## Verification

`npm run check`, focused DB tests, `npm run test`, `npm run build`.

