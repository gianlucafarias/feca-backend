# Plan 003: Sanitize validation errors

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: `8cdc37e`

## Objective

Prevent rejected DTO payloads, including OAuth codes and refresh tokens, from
being echoed in HTTP validation responses.

## Scope and behavior

- Replace the raw class-validator `ValidationError[]` response from
  `src/main.ts` with a stable public structure containing field paths and
  constraint messages only.
- Recursively support nested DTO errors without returning `target`, `value`,
  raw request bodies, or internal object instances.
- Preserve HTTP 422 and the public message `Request validation failed`.
- Add focused unit/integration tests with a sentinel secret and assert that the
  serialized response does not contain it.
- Do not change DTO validation rules.

## Verification

- focused validation formatter/bootstrap test
- `npm run check`
- `npm run test`
- `npm run build`

## Git

One commit on `advisor/003-validation-redaction`, suggested message:
`fix: sanitizar errores de validacion`.

