# Plan 019: Centralize Google Place ID normalization

- **Priority**: P3
- **Effort**: S
- **Risk**: MEDIUM
- **Depends on**: 002
- **Category**: maintainability

## Objective

Replace the three divergent Google Place ID normalizers with one canonical,
well-tested function.

## Required behavior

- Inventory call sites and behavioral differences before choosing the contract.
- Export one canonical normalizer from a dependency-neutral module.
- Migrate all call sites and delete duplicates.
- Add a table-driven corpus covering URLs, prefixes, whitespace, malformed
  values, and already canonical IDs.
- No response or persisted-ID changes for valid existing inputs.

## Verification

Focused corpus tests, `npm run check`, full tests/build.

