# Plan 020: Split oversized critical modules without behavior changes

- **Priority**: P3
- **Effort**: L
- **Risk**: MEDIUM
- **Depends on**: 007, 009, 010, 011, 013, 015, 019
- **Category**: architecture, documentation

## Objective

Separate responsibilities in critical modules over 500 lines after their
behavior is protected by tests, and update architecture docs.

## Required behavior

- Re-measure after prerequisite plans. Do not split cohesive
  `src/lib/nearby-ranking.ts` or the declarative `prisma/schema.prisma`.
- Execute independent characterization-first series:
  1. Google clients: characterize field masks, geocoding and trace redaction;
     extract dependency-neutral types/transport; then a concrete geocoding
     client. Keep the Places New API facade stable.
  2. Notification automations: characterize schedule/dedupe/visibility; extract
     pure calendar functions; then concrete group-reminder and recommendation
     handlers behind the existing public orchestrator.
  3. Data Portability: characterize lifecycle/queue/retry/matching; extract a
     concrete import processor consumed by the worker while controllers keep
     the existing facade.
  4. Nearby: only after the preserved Plan 002/019 stack is integrated,
     characterize orchestration; delegate candidate/cache fallback to the
     existing `PlacesNearbyPoolService` and canonical city resolution to the
     existing `PlacesCitiesService`.
  5. Docs: reconcile runtime claims/routes first; then split
     `docs/mobile-api-spec.md` into domain files with the original path as TOC.
- Each bullet above is its own branch/commit series. Never combine all modules
  into one refactor.
- No new abstraction without at least two real consumers.
- Update `docs/architecture.md`, testing, async-job, and production-readiness
  claims to reflect the final runtime.

## Confirmed stale documentation

- Production readiness incorrectly claims every source file is at most 500
  lines.
- Architecture file counts are stale and its `db-performance.md` link is
  broken.
- Mobile API has a duplicate/mojibake migration heading, omits five notification
  types, and omits multiple implemented mobile/import routes.
- Data Portability docs describe Maps visits as implemented, retain “services
  to create” language, and contain absolute local filesystem links.

## Verification

Existing contract/integration suite, `npm run check`, full tests/build after
each extraction.

## Execution record

- Notification automations: reviewed through `3ec57cd`; public orchestrator
  preserved, concrete group-reminder and recommendation services extracted.
- Nearby orchestration: reviewed through `2ff9873`; service reduced from 585 to
  371 lines while preserving the approved local ranking/open-now stack.
- Google Places client: reviewed through `a2ba0a0`; facade reduced from 892 to
  492 lines with concrete transport, geocoding, mapping, and request helpers.
- Data Portability and the final documentation reconciliation remain in
  progress.
