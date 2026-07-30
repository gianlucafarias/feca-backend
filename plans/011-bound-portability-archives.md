# Plan 011: Bound Data Portability archive downloads and extraction

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: security, resilience

## Objective

Reject oversized, slow, malformed, or zip-bomb-like archives without exhausting
memory, disk, CPU, or worker capacity.

## Required behavior

- Add configurable connect/read/overall timeouts and abort fetches.
- Enforce compressed bytes, entry count, per-entry bytes, total expanded bytes,
  and compression-ratio limits while streaming.
- Reject path traversal and unsupported entry types.
- Preserve import failure-state recording with a safe public reason.
- Tests cover oversized content length, chunked overflow, too many entries,
  expansion overflow, traversal, and timeout.

## Verification

Focused parser/archive tests, `npm run check`, full tests/build.

