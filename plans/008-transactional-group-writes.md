# Plan 008: Make group and membership writes transactional

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 005, 012
- **Category**: data integrity

## Objective

Prevent a 4xx/5xx response from leaving a partially created group, membership,
invite, event, or RSVP.

## Required behavior

- Fix these confirmed write-before-failure paths:
  - `SocialGroupsService.createGroup`: invite-policy rejection currently happens
    after group/members/settings are written.
  - `SocialGroupsService.addGroupMembers`: allowed members are written before a
    mixed allowed/rejected request returns 422.
  - `SocialGroupMembershipRepository.leaveGroup`: membership is changed before
    fallible hydration.
- Keep `joinGroupByCode` and `setGroupEventRsvp` transactional, but make
  impossible post-write null branches throw so Prisma rolls back defensively.
- Validate fallible preconditions before writes where possible.
- Wrap the remaining related writes in one Prisma transaction passed through
  repository methods.
- Preserve public response/error contracts.
- Add rollback tests that force each later write to fail and assert no partial
  rows remain.
- Do not include notification delivery side effects; those belong to Plan 013.
- Treat Place/City rows resolved before `addGroupEvent` as reusable canonical
  cache, not rollback-owned group state; never keep a DB transaction open across
  a Google request.

## Verification

`npm run check`, focused real-DB rollback tests, `npm run test`, `npm run build`.
