# Plan 016: Strengthen CI, coverage, and test configuration

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 012
- **Category**: delivery

## Objective

Make CI compile the deployable artifact, measure coverage across application
code, and remove the Vitest SWC/Oxc configuration warning.

## Required behavior

- Run `npm run build` as a required PR job before image publication.
- Expand coverage from `src/lib` to meaningful `src/**/*.ts` application code
  with explicit generated/bootstrap exclusions.
- Set realistic ratchetable thresholds based on the first full baseline.
- Correct or remove the unsupported transformer configuration producing the
  warning.
- Update testing docs to match actual CI.

## Verification

Local equivalents of every CI command and workflow syntax validation.

