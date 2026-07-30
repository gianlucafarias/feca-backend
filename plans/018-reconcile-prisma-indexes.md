# Plan 018: Reconcile Prisma schema with migration indexes

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 012
- **Category**: database maintenance

## Objective

Represent the session-expiration index created by migrations in
`schema.prisma`, and detect future migration/schema drift.

## Required behavior

- Identify the exact existing index definition and add the equivalent Prisma
  model index without creating a duplicate migration.
- Add a documented/schema-drift check suitable for CI.
- Verify generated SQL against a migrated scratch database.

## Verification

`prisma format`, `prisma validate`, drift check, full checks/build.

