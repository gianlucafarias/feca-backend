# Plan 004: Redact sensitive query strings from observability

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security, observability
- **Planned at**: `8cdc37e`

## Objective

Ensure OAuth callback `code`, `state`, and other query parameters never enter
request-context, metrics, or exception logs.

## Scope and behavior

- Introduce one shared request-path sanitizer that strips the query string and
  fragment while preserving the pathname.
- Use it in request context, HTTP metrics, and the global exception filter.
- Audit all logging of `originalUrl`, `url`, request query, and callback DTOs;
  update any reachable sensitive path.
- Tests must pass a sentinel OAuth code and state through success and exception
  paths and prove neither appears in log/metric context.
- Do not remove request IDs, methods, status codes, or route path visibility.

## Verification

- focused observability tests
- `npm run check`
- `npm run test`
- `npm run build`

## Git

One commit on `advisor/004-query-log-redaction`, suggested message:
`fix: redactar query strings sensibles`.

