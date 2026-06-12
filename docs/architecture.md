# Architecture notes

Internal structure conventions for `feca-backend` as we prepare for production scale.

## Repository layout

### Social domain (`src/infrastructure/repositories/social/`)

The social persistence layer was split from a single 2.7k-line file into focused repositories:

| File | Lines | Responsibility |
|------|-------|----------------|
| `social.repository.ts` (facade) | 232 | Thin facade delegating to sub-repos |
| `social-graph.repository.ts` | 449 | User profile, search, follow graph, settings, taste |
| `social-visits.repository.ts` | 170 | Visits, saves, recently interacted places |
| `social-groups.repository.ts` | 289 | Group CRUD, public plans (facade) |
| `social-group-membership.repository.ts` | 294 | Invites, join-by-code, leave |
| `social-group-events.repository.ts` | 115 | Group events and RSVPs |
| `social-diaries.repository.ts` | 142 | Diaries and diary places |
| `social-place-context.repository.ts` | 431 | Nearby network signals, place social context |
| `social-feed.repository.ts` | 490 | Feed modes: network, nearby, city, now |
| `social.repository.types.ts` | 106 | Prisma includes, shared types, constants |
| `social.repository.helpers.ts` | 318 | Pure functions (permissions, feed scoring, signals) |
| `social.repository.support.ts` | 132 | Shared DB helpers (`ensureUserSettings`, relationship maps) |

**User settings:** legacy `ensureUserSettingsForAllUsers()` (full table scan) was replaced with per-user `upsert` via `SocialRepositorySupport.ensureUserSettings(userId)`.

### API presenters (`src/lib/presenters/`)

Serializers were split from `api-presenters.ts`:

- `user.presenter.ts` — users, auth, social settings
- `place.presenter.ts` — places, visits, saves
- `group.presenter.ts` — groups, events, public plans
- `diary.presenter.ts` — diaries
- `notification.presenter.ts` — notifications

`src/lib/api-presenters.ts` re-exports everything for backward compatibility.

### Social services (`src/social/`)

The social application layer was split from a single ~1538-line file into focused services:

| File | Lines | Responsibility |
|------|-------|----------------|
| `social.service.ts` (facade) | 199 | Thin facade delegating to sub-services |
| `social.helpers.ts` | 401 | Pure functions (feed reasons, diary visibility, invites) |
| `social-feed.service.ts` | 106 | Feed modes |
| `social-users.service.ts` | 272 | Profile, search, follow, settings, taste, visits |
| `social-saves.service.ts` | 81 | Place saves |
| `social-groups.service.ts` | 374 | Groups, memberships, public plans |
| `social-group-events.service.ts` | 211 | Group events and RSVPs |
| `social-diaries.service.ts` | 278 | Diaries |

Controllers continue to inject `SocialService` only.

### Places domain (`src/places/`)

The places application layer was split from a single ~1674-line service into focused services:

| File | Lines | Responsibility |
|------|-------|----------------|
| `places.service.ts` (facade) | 97 | Thin facade delegating to sub-services |
| `places-google-cache.service.ts` | 181 | Google/cache infrastructure shared across place flows |
| `places-cities.service.ts` | 219 | City autocomplete, reverse geocode, canonical city records |
| `places-autocomplete.service.ts` | 176 | Place autocomplete (local + Google merge) |
| `places-profile.service.ts` | 269 | Resolve, manual create, place profile |
| `places-nearby.service.ts` | 438 | Nearby/explore orchestration |
| `places-nearby-pool.service.ts` | 188 | Candidate pool, Google fetch, cache keys |
| `places-nearby-presentation.service.ts` | 180 | Photo hydration, social chips, badges |
| `places-nearby.helpers.ts` | 200 | Pure functions (mappers, shuffle, normalize IDs) |
| `places.constants.ts` | 4 | Shared cache TTL constants |

Controllers and other modules keep importing `PlacesService` only.

### Geo / nearby (`src/lib/geo-bounds.ts`)

Nearby SQL uses bounding-box pre-filter + haversine refinement. See [db-performance.md](../db-performance.md).

## Related docs

- [Production readiness](./production-readiness.md)
- [Testing](./testing.md)
