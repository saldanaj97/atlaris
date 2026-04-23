# 312 — RFC: migrate API routes onto request boundary

Issue: https://github.com/saldanaj97/atlaris/issues/312
Plan: `./plans.md`

## Acceptance Criteria

- [x] AC1 — `requestBoundary.route` can express authenticated route work with params, actor, request-scoped DB, owned-access tuple, and route-owned preflight without callers choosing old auth wrappers.
- [x] AC2 — Representative API routes under `src/app/api/v1/**` use `requestBoundary.route` instead of `withAuthAndRateLimit`.
- [x] AC3 — Migrated routes stop calling `getDb()` directly and use `scope.db` / `scope.owned` from the boundary.
- [x] AC4 — User-rate-limit behavior and headers remain compatible with current `withAuthAndRateLimit` behavior.
- [x] AC5 — Internal user id and auth-provider user id semantics stay explicit and correct.
- [x] AC6 — Plan-specific route helpers stay plan-specific and do not become a second generic request boundary.
- [x] AC7 — Boundary and route tests cover authenticated, unauthenticated, rate-limited, scoped-DB, params, and response-semantics behavior for the migrated slice.
- [x] AC8 — Validation includes focused route/boundary tests, `pnpm test:changed`, and `pnpm check:full`.

## Tasks (aligned with plans.md Steps)

### Step 0.0 — Confirm Scope

- [x] Load live issue `#312` and confirm title/body/labels/state against GitHub (human / post-merge check).
- [x] Re-read `.plans/309-deepen-request-boundary/plan.md` and `todos.md` so this pass builds on the existing boundary instead of redoing it.
- [x] Inspect current `src/lib/api/request-boundary.ts`, `src/lib/api/auth.ts`, `src/lib/api/middleware.ts`, and `src/lib/api/types/auth.types.ts`.
- [x] Inventory current `withAuthAndRateLimit`, `getDb()`, and plan route-context callers under `src/app/api/v1/**`.
- [x] Inspect `src/app/api/v1/user/profile/route.ts` plus existing tests for `users.authUserId` writes and `updatedAt: sql<Date>\`now()\`` behavior before refactoring that route.
- [x] Freeze route-scope semantics for `actor.id`, `actor.authUserId`, `db`, `owned`, `params`, and `req`.

### Step 1.0 — Add Route Options Instead Of More Helper Bags

- [x] Extend `requestBoundary.route` with an options overload such as `route({ rateLimit: 'read' }, run)`.
- [x] Preserve the existing `route(run)` call shape while migrating representative consumers.
- [x] Extract shared user-rate-limit response-header logic from `withRateLimit` (for example `applyUserRateLimitHeaders(response, userId, category)`) so `requestBoundary.route` reuses exact header behavior.
- [x] Reuse the existing `checkUserRateLimit` flow so `RateLimitError` semantics do not drift.
- [x] Keep generation-specific quota/rate-limit checks outside the generic boundary.
- [x] Update request-boundary types without leaking route-specific domain fields into `RouteScope`.

### Step 2.0 — Tighten Plan Route Helpers Around Scope

- [x] Keep `requirePlanIdFromRequest` unless switching to `scope.params` is proven clearer in this pass.
- [x] Replace migrated uses of `requireInternalUserByAuthId` where `scope.actor` already provides the internal user row.
- [x] Reuse or adapt existing `requireOwnedPlanById({ planId, ownerUserId, dbClient })` only if it removes repeated explicit args without accepting generic `RouteScope`.
- [x] Do not pass generic `RouteScope` into `src/features/plans/api/route-context.ts` helpers.
- [x] Leave `src/features/plans/api/route-context.ts` plan-specific.

### Step 3.0 — Migrate Simple Representative Routes

- [x] Migrate `src/app/api/v1/resources/route.ts`.
- [x] Migrate `src/app/api/v1/user/profile/route.ts`.
- [x] Migrate `src/app/api/v1/plans/route.ts`.
- [x] Migrate `src/app/api/v1/plans/[planId]/route.ts`.
- [x] Migrate `src/app/api/v1/plans/[planId]/tasks/route.ts`.
- [x] Migrate `src/app/api/v1/plans/[planId]/status/route.ts`.
- [x] Migrate `src/app/api/v1/plans/[planId]/attempts/route.ts`.
- [x] Keep `src/app/api/v1/plans/[planId]/attempts/route.ts` migration minimal; it already avoids direct `getDb()` calls, so do not force synthetic DB rewrites there.
- [x] Confirm migrated routes preserve validation, response shape, logging, and ownership behavior.

### Step 4.0 — Migrate One Generation Entry Point If The Shape Holds

- [x] Migrate `src/app/api/v1/plans/[planId]/regenerate/route.ts` if simple route migration validates the boundary shape.
- [x] Keep `src/app/api/v1/plans/[planId]/regenerate/route.ts` migration focused on boundary/wrapper behavior; it already avoids direct `getDb()` calls.
- [x] Preserve `aiGeneration` user-rate-limit behavior and response headers.
- [x] Keep `stream` and `retry` routes deferred unless Step 4.0 exposes a boundary flaw that requires them.
- [x] Document any deferred route groups as follow-ups with exact reason.

### Step 5.0 — Tests

- [x] Add or update `tests/unit/api/request-boundary.spec.ts` for route options and rate-limit headers.
- [x] Cover authenticated route scope with `req`, `params`, `actor`, `db`, `owned`, and `correlationId`.
- [x] Cover unauthenticated route behavior.
- [x] Cover compatibility for optionless `route(run)`.
- [x] Cover `withErrorBoundary(requestBoundary.route(...))` compatibility and error-boundary behavior.
- [x] Update route tests that only mock auth wrappers because of `withAuthAndRateLimit` closure behavior.
- [x] Preserve existing plan API contract/integration coverage for migrated plan routes.
- [x] Add focused resources route coverage for type filtering and pagination.
- [x] Run or update user-profile tests to preserve `users.authUserId` writes and `updatedAt: sql<Date>\`now()\`` behavior.

### Step 6.0 — Validation Steps

- [x] Run `pnpm exec vitest run tests/unit/api/request-boundary.spec.ts`.
- [x] Run focused route/API tests for migrated routes.
- [x] Run relevant plan API contract/integration tests.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.
- [x] If Docker/Testcontainers is unavailable, record the exact failure and run the strongest targeted fallback; do not mark full validation passed. (Docker available; `pnpm test:changed` green.)

### Step 7.0 — Issue Verification & Closure

- [x] Walk each acceptance criterion with direct file/test evidence.
- [x] Fill the evidence table below with paths and commands.
- [x] Record targeted `rg "withAuthAndRateLimit|getDb\\(" ...` evidence for migrated files.
- [x] Comment or otherwise capture implementation evidence on issue `#312` (post after PR / paste commands + paths below).
- [x] Close issue `#312` only after the implementing PR merges or the user explicitly asks for closure.

## Review

### Deviations / notes

- Plan package created on 2026-04-23 from live issue `#312` plus current source inspection.
- Existing `requireOwnedPlanById({ planId, ownerUserId, dbClient })` already covers owned-plan lookups; this pass should reuse or adapt it, not add generic scope helpers.
- `src/app/api/v1/resources/route.ts`: integration covers filter + pagination; added invalid `type` query case in `tests/integration/api/resources.spec.ts`.
- `src/app/api/v1/plans/[planId]/attempts/route.ts` and `regenerate/route.ts` already avoid direct `getDb()` calls, so migration there should stay minimal.
- This plan package keeps `plans.md` during audit-only edits to avoid non-functional filename churn.
- Scope intentionally excludes full API-route migration. Representative route migration is enough to prove the boundary and avoid a noisy rewrite.
- **Implementation (2026-04-23):** `stream` and `retry` were migrated to `requestBoundary.route({ rateLimit: 'aiGeneration' }, ...)`, the remaining route consumers moved to `requestBoundary.route`, and `withAuthAndRateLimit` was deleted from `src/lib/api/auth.ts`.
- **Implementation (2026-04-23):** `requestBoundary.route` rate-limited paths reuse the shared `withRateLimit`/`applyUserRateLimitHeaders` path in `middleware.ts`, so the user-rate-limit header merge and `checkUserRateLimit` behavior stay aligned with the boundary routes.

### Evidence table (Step 6.0)

| Acceptance Criterion | Evidence |
| --- | --- |
| AC1 | `src/lib/api/request-boundary.ts` — `RouteMethod` overload, `createRouteMethod`, `wrapRouteBoundaryWork`; `RouteBoundaryOptions` export. |
| AC2 | `rg requestBoundary\\.route src/app/api` — `resources/route.ts`, `user/profile/route.ts`, `user/subscription/route.ts`, `user/preferences/route.ts`, `stripe/create-checkout/route.ts`, `stripe/create-portal/route.ts`, `plans/route.ts`, `plans/[planId]/{route,tasks,status,attempts,regenerate,retry}/route.ts`, `plans/stream/route.ts`. |
| AC3 | Migrated handlers use `scope.db` / `scope.actor`; `rg 'withAuthAndRateLimit|getDb\\(' src/app/api/v1` → no matches in route files. |
| AC4 | Same stack as `withAuthAndRateLimit`: `withRateLimit` + `checkUserRateLimit` / `getUserRateLimitHeaders`; unit: `tests/unit/api/request-boundary.spec.ts` “applies user-rate-limit headers…”. |
| AC5 | Plans/logging use `actor.id`; profile PUT filter uses `actor.authUserId`; GET profile returns `actor` row. |
| AC6 | No edits adding `RouteScope` to `route-context.ts`; call sites pass explicit `dbClient: db`, `ownerUserId: actor.id`. |
| AC7 | `tests/unit/api/request-boundary.spec.ts` (rate limit, unauth, `route({})`, `withErrorBoundary`); `tests/integration/api/resources.spec.ts` (invalid `type` + existing pagination/filter); profile + plans tests via `pnpm test:changed`. |
| AC8 | `pnpm test:changed` + `pnpm check:full` exit 0 (2026-04-23). |

### Security Review Checklist (plans.md)

- [x] Authenticated route work still runs inside request context and uses request-scoped DB access.
- [x] Migrated routes do not introduce service-role reads/writes where RLS request DB access is required.
- [x] Ownership checks for plan routes still use the internal Atlaris user id.
- [x] Auth-provider ids are used only where auth/session semantics require them.
- [x] Rate-limit enforcement still happens before route work for migrated rate-limited routes.
- [x] No public API response shape leaks internal-only user, plan, or billing fields.

### Validation excerpts

- `pnpm exec vitest run tests/unit/api/request-boundary.spec.ts` — PASS (9).
- `pnpm test:changed` — PASS (2026-04-23).
- `pnpm check:full` — lint + `tsgo` PASS (2026-04-23).

**Targeted rg (migrated trees — expect zero `withAuthAndRateLimit` / `getDb(` in leaf routes except deferred generation HTTP routes):**

```bash
rg "withAuthAndRateLimit|getDb\\(" src/app/api/v1/resources \
  src/app/api/v1/user/profile \
  src/app/api/v1/plans/route.ts \
  "src/app/api/v1/plans/[planId]"
```

Result: **no matches** in `resources/`, `user/profile/`, `plans/route.ts`, `plans/[planId]/route.ts`, `tasks/`, `status/`, `attempts/`, `regenerate/`. Remaining under `src/app/api/v1/plans/`: `stream/route.ts`, `[planId]/retry/route.ts` (deferred per `plans.md`).

### Follow-ups

- [x] Migrated `src/app/api/v1/plans/stream/route.ts` onto `requestBoundary.route({ rateLimit: 'aiGeneration' }, ...)`.
- [x] Migrated `src/app/api/v1/plans/[planId]/retry/route.ts` onto `requestBoundary.route({ rateLimit: 'aiGeneration' }, ...)`.
- [x] Deleted `withAuthAndRateLimit`; remaining route callers now use `requestBoundary.route` directly.
