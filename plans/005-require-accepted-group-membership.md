# Plan 005: Require accepted membership for group mutations

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: authorization
- **Planned at**: `8cdc37e`

## Objective

Prevent pending invitees from creating or mutating group events and RSVPs.

## Scope and behavior

- Change the writable group-access assertion so only
  `GroupMemberStatus.accepted` may mutate group events/RSVPs.
- Keep read visibility and invite acceptance flows unchanged.
- Return the existing generic membership-forbidden contract; do not reveal
  private group state.
- Add a mutation matrix for missing, pending, declined, left, and accepted
  membership, including at least create event and RSVP.
- Do not broaden organizer/admin privileges beyond current behavior.

## Verification

- focused group-event authorization tests
- `npm run check`
- `npm run test`
- `npm run build`

## Git

One commit on `advisor/005-accepted-group-writes`, suggested message:
`fix: exigir membresia aceptada para mutaciones`.

