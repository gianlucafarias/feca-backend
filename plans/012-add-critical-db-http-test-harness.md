# Plan 012: Add critical database and HTTP test harnesses

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: 001, 003, 004, 005, 006
- **Category**: testing

## Objective

Provide repeatable PostgreSQL-backed integration tests and HTTP contract tests
for auth, guards, privacy, transactions, and worker claims.

## Required behavior

- Use an isolated test database with migrations, deterministic cleanup, and no
  production credentials.
- Add reusable app bootstrap + authenticated request helpers.
- Keep unit tests fast; expose focused integration and CI commands.
- Seed the smallest fixtures needed.
- Document local/CI usage and fail closed if the test DB is not explicitly
  marked safe.
- Establish one passing smoke test for transaction rollback and one for HTTP
  authentication.

## Verification

Fresh database run, repeated run, `npm run check`, unit suite and build.

