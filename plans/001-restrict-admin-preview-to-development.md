# Plan 001: Restrict the self-service admin preview to development

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8cdc37e..HEAD -- src/common/guards/admin-preview.guard.ts src/social/me.controller.ts src/social/social.module.ts test/integration/admin-preview.guard.spec.ts`
>
> If any existing in-scope file changed since this plan was written, compare
> the "Current state" excerpts against the live code before proceeding. If an
> excerpt no longer matches in substance, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8cdc37e`, 2026-07-26

## Why this matters

FECA deliberately exposes `PATCH /v1/me/admin` so developers can preview the
admin experience from the mobile app. That preview must remain available in
`NODE_ENV=development`, but it must not allow an authenticated user to grant
themselves persistent admin access in `test` or `production`.

The change must isolate only this preview route. Existing authorization through
`AdminGuard`, `FECA_ADMIN_EMAILS`, and controlled persistent
`User.isAdminOverride` values must keep working. The separate editor preview
route is not part of this change.

## Current state

Relevant files:

- `src/social/me.controller.ts` — exposes the authenticated editor and admin
  preview endpoints.
- `src/social/social.module.ts` — owns `MeController` and its providers.
- `src/common/guards/admin.guard.ts` — authorizes real admin endpoints through
  configured email addresses or the persisted override. It must not be changed.
- `src/config/app-config.service.ts` — exposes the validated `nodeEnv` value.
- `test/integration/queue.service.spec.ts` — demonstrates the repository's
  Vitest/Nest testing conventions and environment stubbing.

Current admin preview route at `src/social/me.controller.ts:167-176`:

```ts
/**
 * Preview de producto: override temporal en memoria para probar herramientas admin.
 * Se pierde al reiniciar el proceso; reemplazar por permisos persistidos.
 */
@Patch("admin")
patchMyAdmin(
  @CurrentUser() user: AccessTokenPayload,
  @Body() body: PatchMeAdminDto,
) {
  return this.authService.setMyAdminFlag(user.sub, body.isAdmin);
}
```

The comment is stale: `AuthService.setMyAdminFlag` writes
`User.isAdminOverride` to PostgreSQL, so the value is persistent.

The whole controller currently has only the access-token guard:

```ts
@Controller("v1/me")
@UseGuards(AccessTokenGuard)
export class MeController {
```

`AppConfigService` already provides the environment without reading
`process.env` directly:

```ts
get nodeEnv() {
  return this.configService.get("NODE_ENV", { infer: true });
}
```

`AdminGuard` currently treats the persisted override as a valid production
authorization source:

```ts
if (this.config.isFecaAdminEmail(user.email)) {
  return true;
}

const adminOverride = await this.authRepository.findUserAdminOverride(user.sub);
if (adminOverride?.isAdminOverride) {
  return true;
}
```

Preserve that behavior. This plan restricts how a user can set their own
override; it does not redesign admin authorization.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install in a fresh worktree | `npm ci` | exit 0 |
| Focused tests | `npm run test -- test/integration/admin-preview.guard.spec.ts` | new test file passes |
| Typecheck | `npm run check` | exit 0, no TypeScript errors |
| Full tests | `npm run test` | all test files pass |
| Production build | `npm run build` | exit 0 and `dist/main.js` exists |

## Scope

**In scope** — these are the only source/test files that may be modified:

- `src/common/guards/admin-preview.guard.ts` — create.
- `src/social/me.controller.ts`.
- `src/social/social.module.ts`.
- `test/integration/admin-preview.guard.spec.ts` — create.
- `plans/README.md` — status update only.

**Out of scope** — do not touch:

- `src/common/guards/admin.guard.ts`.
- `src/auth/auth.service.ts` and `src/auth/auth.repository.ts`.
- `src/social/me.controller.ts` route `PATCH /v1/me/editor`.
- Prisma schema or migrations.
- `FECA_ADMIN_EMAILS` behavior.
- Existing `isAdminOverride` rows or any automatic data cleanup.
- Public response bodies from `AuthService.setMyAdminFlag`.
- Any of the unrelated local changes under `src/lib/` or `src/places/`.

## Git workflow

- If an isolated executor worktree already has a branch, keep it.
- Otherwise use `fix/dev-only-admin-preview`.
- Keep the change in one logical commit. Suggested message:
  `fix: limitar preview admin a development`.
- Do not push or open a pull request unless the operator explicitly requests it.

## Steps

### Step 1: Add a dedicated environment guard for the admin preview

Create `src/common/guards/admin-preview.guard.ts`.

Implement an injectable Nest guard named `AdminPreviewGuard` that:

1. Injects `AppConfigService`.
2. Returns `true` only when `config.nodeEnv === "development"`.
3. Throws `NotFoundException` for every other environment, including `test`
   and `production`.
4. Uses a generic not-found response; do not reveal that a hidden admin preview
   route exists.
5. Does not inspect `process.env` directly.

Target shape:

```ts
import {
  CanActivate,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class AdminPreviewGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate() {
    if (this.config.nodeEnv !== "development") {
      throw new NotFoundException();
    }

    return true;
  }
}
```

Do not make this a global guard. It is specific to the self-service admin
preview.

**Verify**:

```bash
npx tsc --noEmit -p tsconfig.build.json
```

Expected: exit 0 with no TypeScript errors after the guard is registered in
Step 2. If this isolated file cannot typecheck before registration, continue
directly to Step 2 without changing its design.

### Step 2: Register the guard and attach it only to `PATCH /v1/me/admin`

In `src/social/social.module.ts`:

1. Import `AdminPreviewGuard`.
2. Add it to the module's `providers` array.

In `src/social/me.controller.ts`:

1. Import `AdminPreviewGuard`.
2. Add `@UseGuards(AdminPreviewGuard)` directly to `patchMyAdmin`.
3. Keep the controller-level `@UseGuards(AccessTokenGuard)` unchanged. Nest
   must apply both the authentication guard and the method-level environment
   guard.
4. Update the route comment so it states that the preview is development-only
   and that the override is persisted. Remove the incorrect “in memory” and
   “lost on restart” claims.
5. Do not add this guard to `patchMyEditor` or any other endpoint.

The method body and response must remain unchanged:

```ts
return this.authService.setMyAdminFlag(user.sub, body.isAdmin);
```

**Verify**:

```bash
npm run check
```

Expected: exit 0 with no TypeScript errors.

### Step 3: Add focused guard and decorator tests

Create `test/integration/admin-preview.guard.spec.ts`, following the Vitest
style used in `test/integration/queue.service.spec.ts`.

The tests must cover:

1. A guard constructed with an `AppConfigService` stub whose `nodeEnv` is
   `development` returns `true`.
2. With `nodeEnv = "test"`, `canActivate` throws `NotFoundException`.
3. With `nodeEnv = "production"`, `canActivate` throws
   `NotFoundException`.
4. Reflective controller metadata confirms that `patchMyAdmin` has
   `AdminPreviewGuard` attached as a method guard. Use Nest's
   `GUARDS_METADATA` constant rather than asserting against source text.
5. Reflective controller metadata confirms that `patchMyEditor` does not have
   `AdminPreviewGuard`.

Use small typed stubs; do not boot PostgreSQL or instantiate the full
`SocialModule`. No test should mutate `process.env`, because the guard's
contract is through `AppConfigService`.

**Verify**:

```bash
npm run test -- test/integration/admin-preview.guard.spec.ts
```

Expected: the new test file passes with all five cases.

### Step 4: Run the complete verification chain

Run:

```bash
npm run check
npm run test
npm run build
```

Expected:

- Typecheck exits 0.
- The full Vitest suite passes, including the five new cases.
- Nest production compilation exits 0 and produces `dist/main.js`.

Then inspect scope:

```bash
git status --short
git diff -- src/common/guards/admin-preview.guard.ts src/social/me.controller.ts src/social/social.module.ts test/integration/admin-preview.guard.spec.ts
```

Expected: no source/test changes outside the four in-scope paths. Pre-existing
changes under `src/lib/` and `src/places/` may still appear in `git status`;
they belong to the operator and must remain untouched.

## Test plan

New file: `test/integration/admin-preview.guard.spec.ts`.

Required cases:

- development permits the preview;
- test hides the preview with 404 semantics;
- production hides the preview with 404 semantics;
- `patchMyAdmin` is decorated with the environment guard;
- `patchMyEditor` is not decorated with it.

Structural pattern: use `describe`, `it`, `expect`, and typed test doubles in
the same style as `test/integration/queue.service.spec.ts`. The test should be
fast and require no network or database.

Verification:

```bash
npm run test -- test/integration/admin-preview.guard.spec.ts
npm run test
```

Expected: focused and full suites both pass.

## Done criteria

- [ ] `PATCH /v1/me/admin` retains the same method body and response in
      development.
- [ ] `AdminPreviewGuard` permits only `NODE_ENV=development`.
- [ ] Test and production receive `NotFoundException` before
      `setMyAdminFlag` can run.
- [ ] The guard is attached only to `patchMyAdmin`.
- [ ] Controller-level `AccessTokenGuard` remains in place.
- [ ] `AdminGuard`, `FECA_ADMIN_EMAILS`, persistent overrides, Prisma, and the
      editor preview are unchanged.
- [ ] `npm run check` exits 0.
- [ ] Focused tests pass with the five required cases.
- [ ] `npm run test` exits 0.
- [ ] `npm run build` exits 0 and `dist/main.js` exists.
- [ ] No files outside the in-scope list were changed by the executor.
- [ ] The plan status in `plans/README.md` is updated as instructed.

## STOP conditions

Stop and report back instead of improvising if:

- `patchMyAdmin` no longer delegates directly to
  `AuthService.setMyAdminFlag`.
- `AdminGuard` no longer supports both `FECA_ADMIN_EMAILS` and controlled
  persisted overrides.
- Product requirements now require self-service admin activation in test or
  production.
- The guard cannot be attached without modifying `AuthModule`,
  `AppConfigModule`, or global guard composition.
- The change appears to require a Prisma migration or automatic modification
  of existing admin rows.
- Any unrelated local change under `src/lib/` or `src/places/` would need to
  be edited or reverted.
- A verification command fails twice after a reasonable correction.

## Maintenance notes

- Before the first production deployment, inspect existing
  `User.isAdminOverride = true` rows. Disabling the self-service endpoint does
  not revoke privileges already persisted. Do not automate that cleanup in
  this plan because some overrides may have been assigned intentionally.
- A future real admin-management endpoint should use `AdminGuard` or a stronger
  role-management policy; it must not reuse this development-only preview
  guard.
- Reviewers should verify guard composition carefully: authentication remains
  controller-wide, while the environment restriction applies only to
  `PATCH /v1/me/admin`.
- The editor preview remains intentionally unchanged and should be reviewed in
  a separate product/security decision if it ever grants privileged behavior.
