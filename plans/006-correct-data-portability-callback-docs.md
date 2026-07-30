# Plan 006: Correct the Data Portability callback contract

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: documentation, integration safety
- **Planned at**: `8cdc37e`

## Objective

Make every setup/deployment document use the callback implemented by
`GoogleDataPortabilityOAuthController`, and eliminate the incompatible OAuth
callback example.

## Scope and behavior

- Derive the canonical callback path from the controller and global prefix.
- Update Data Portability, deployment, environment-example, and mobile API
  documentation where applicable.
- Clearly distinguish the Google identity login client from the Data
  Portability OAuth client.
- Add a small contract test for the controller route metadata if no existing
  HTTP integration test guarantees the path.
- Do not change the runtime callback route solely to match stale docs.

## Verification

- repository search finds no stale callback value
- focused route contract test, if added
- `npm run check`
- `npm run test`

## Git

One commit on `advisor/006-portability-callback-docs`, suggested message:
`docs: corregir callback de data portability`.

