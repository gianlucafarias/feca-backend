# Plan 009: Enforce `diaryVisibility` everywhere

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 012
- **Category**: privacy

## Objective

Make stored diary privacy settings authoritative for search, profile lists,
detail access, feed inclusion, and group-related projections.

## Required behavior

- Centralize a viewer/owner/follow relationship visibility predicate.
- Apply it in database queries when feasible, not after materializing data.
- Cover `public`, `followers`, and `private`, including owner access and
  blocked/removed relationships.
- Existing diary IDs must not bypass visibility on direct lookup.
- Add a real-DB privacy matrix across every read surface.

## Verification

`npm run check`, focused privacy integration tests, `npm run test`, build.

