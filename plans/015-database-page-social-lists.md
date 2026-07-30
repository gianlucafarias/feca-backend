# Plan 015: Paginate social lists in the database

- **Priority**: P2
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: 009, 012
- **Category**: performance

## Objective

Stop loading and decorating entire diary/group/follower collections before
applying offset/limit.

## Required behavior

- Push visibility, stable ordering, and pagination into repository queries.
- Fetch only bounded enrichment data for the returned page.
- Preserve response shapes and deterministic ordering/tie breakers.
- Add fixtures larger than one page and query-count assertions.
- Do not change the public pagination contract in this branch.

## Verification

Focused DB pagination tests, `npm run check`, full tests/build.

