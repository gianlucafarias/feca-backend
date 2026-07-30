# Plan 002: Stabilize `home_open_now` without losing local work

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: correctness, performance
- **Planned at**: `8cdc37e`, with the preserved local patch
  `/tmp/feca-backend-preexisting-nearby-20260726.patch`

## Objective

Finish the in-progress nearby work while guaranteeing that `home_open_now`
never re-inserts a closed curated place, evaluates persisted schedules in the
place's timezone rather than the server timezone, and bounds Google detail
lookups with a small concurrency limit and request budget.

## Preconditions and STOP conditions

1. Create the executor branch from `8cdc37e`.
2. Apply the preserved local patch before editing.
3. Verify the patch SHA-256 is
   `51f666fe42d191d1b430a2df643f434e756eda6ad38f001eea47a28b011c66b4`.
4. Stop if the patch no longer applies cleanly. Never alter or stash the
   original worktree.

## Scope

- The six files contained in the preserved nearby patch.
- Nearby DTO/types only if a place timezone must be carried explicitly.
- Focused nearby tests.
- No unrelated recommendation/ranking redesign.

## Required behavior

1. Preserve the user's existing nearby changes and tests.
2. Filter the final result after curated-place insertion so
   `home_open_now` contains only `openNow === true`.
3. Infer schedule state with a supplied IANA timezone. Do not use the server's
   local `Date#getHours()` as the place clock. If timezone is unavailable,
   leave the state unknown rather than asserting a possibly wrong value.
4. Limit detail hydration concurrency (target 4–8) and keep an explicit finite
   per-request budget.
5. A failed detail lookup must fall back safely without failing the whole
   nearby request.

## Verification

- Tests for closed curated re-insertion.
- Tests proving the same instant yields correct results across two timezones.
- Test proving the concurrency cap.
- `npm run check`
- focused nearby tests
- `npm run test`
- `npm run build`

## Git

One commit on `advisor/002-home-open-now`, suggested message:
`fix: estabilizar resultados abiertos ahora`.

