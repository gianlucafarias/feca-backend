# Plan 017: Prevent OAuth state replay

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 004, 012
- **Category**: OAuth security

## Objective

Make each Data Portability OAuth state single-use, short-lived, and bound to
the intended import/user.

## Required behavior

- Persist only a cryptographic hash/nonce identifier with expiry and consumed
  timestamp; do not log raw state.
- Atomically consume it before code exchange.
- Reject replay, expiry, wrong import/user, and tampering with the same generic
  callback error.
- A failed code exchange must not make a valid state replayable.
- Add migration and concurrent callback tests.

## Verification

Prisma checks, focused OAuth DB/HTTP tests, full checks/build.

