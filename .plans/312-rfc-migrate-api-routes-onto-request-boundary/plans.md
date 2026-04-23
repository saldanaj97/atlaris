# 312 — RFC: migrate API routes onto request boundary

Issue: https://github.com/saldanaj97/atlaris/issues/312

## Issue Summary

`requestBoundary` already gives server components and server actions a single scope containing the authenticated actor, request-scoped DB client, owned-access tuple, and correlation id. API routes still mostly use the old caller model: choose `withAuthAndRateLimit`, reach for `getDb()`, distinguish auth-provider user id from internal user id, and manually pass DB capabilities through route-local helpers.

That half-migration is the real risk. If routes keep using wrapper plumbing directly, `requestBoundary.route` becomes another wrapper instead of the default request-scope API.

## Current State

- `src/lib/api/request-boundary.ts` exposes `requestBoundary.route`, `.component`, and `.action`.
- `requestBoundary.route` currently wraps `withAuth`, resolves route params, and builds a `RouteScope` with `req`, `params`, `actor`, `db`, `owned`, and `correlationId`.
- `src/lib/api/auth.ts` still exposes `withAuthAndRateLimit(category, handler)` and most API routes use it.
- `src/lib/api/middleware.ts` owns `withRateLimit(category)` and rate-limit headers for user-scoped limits.
- `src/features/plans/api/route-context.ts` still has route helpers that accept `req`, `authUserId`, `ownerUserId`, and optional `dbClient`; this overlaps with the scope object `requestBoundary.route` should provide.
- Existing route-level boundary tests live in `tests/unit/api/request-boundary.spec.ts`, but route coverage does not yet prove rate-limited route behavior or migration ergonomics.

## Research Notes

### Existing Boundary And Auth Plumbing

- `src/lib/api/request-boundary.ts` builds scope via `buildScope(actor, getDb())`.
- `src/lib/api/auth.ts` resolves auth, creates the RLS context outside tests, provisions the internal user row, installs request context, and cleans up the request DB client.
- `withAuthAndRateLimit` composes `withAuth(withRateLimit(category)(handler))`, which means rate limiting still acts on the auth-provider user id and appends standard user-rate-limit headers after the route returns.

### Representative API Routes

Good first migration candidates:

- `src/app/api/v1/resources/route.ts` — simple read route; currently calls `getDb()` after `withAuthAndRateLimit('read', ...)`.
- `src/app/api/v1/user/profile/route.ts` — read and mutation route; exposes the auth-provider/internal-user-id mismatch most clearly through `requireInternalUserByAuthId(userId, db)` and `users.authUserId` updates.
- `src/app/api/v1/plans/route.ts` — list route; uses internal `user.id`, request DB, pagination, total count header, and integration coverage.
- `src/app/api/v1/plans/[planId]/route.ts` — read and mutation route; uses path-derived plan id, explicit ownership, request DB, logging, and delete semantics.
- `src/app/api/v1/plans/[planId]/tasks/route.ts` — nested plan route; uses ownership preflight plus downstream task query.
- `src/app/api/v1/plans/[planId]/status/route.ts` and `attempts/route.ts` — read-only nested routes; useful for confirming plan-read routes can share the same scope shape.

More complex candidates to migrate after the simple routes prove the shape:

- `src/app/api/v1/plans/stream/route.ts` — AI generation route; combines request body parsing, plan-generation quota/rate-limit headers, Sentry logging, internal user id, saved preferred model, and streaming response.
- `src/app/api/v1/plans/[planId]/retry/route.ts` — generation retry route; combines path plan id, ownership preflight, retry status preflight, generation-specific rate-limit headers, auth-provider id, internal user id, and streaming response.
- `src/app/api/v1/plans/[planId]/regenerate/route.ts` — regeneration queue route; currently uses `withAuthAndRateLimit('aiGeneration', ...)` and delegates quota/result mapping to orchestration.

### Existing Tests

- `tests/unit/api/request-boundary.spec.ts` covers authenticated route scope, unauthenticated route failure, component/action optional auth, and request context DB identity in test mode.
- `tests/integration/api/plans-list-pagination.spec.ts` documents a current pain point: route tests mock `@/lib/auth/server` because `withAuthAndRateLimit` closes over auth inside the route wrapper.
- `tests/integration/contract/plans.get.spec.ts`, `plans.attempts.get.spec.ts`, `plans.status-parity.spec.ts`, and `plans.api-integration.spec.ts` cover plan-route response behavior.
- Generation route behavior is covered across `tests/integration/api/plans-stream.spec.ts` and `tests/integration/features/plans/session/respond-create-stream.spec.ts`; do not collapse that coverage into request-boundary tests.

## Proposed Approach

### Step 0.0 — Confirm Scope And Freeze Route Contract

Treat this as a representative migration, not a full API-route rewrite. The goal is to prove and refine `requestBoundary.route` with enough variety that future routes do not need the old wrapper mental model.

Freeze these route-scope decisions before broad migration:

- `scope.actor.id` is the internal Atlaris user id.
- `scope.actor.authUserId` is the auth-provider subject.
- `scope.db` is the request-scoped DB client for route reads/writes.
- `scope.owned` is the default `{ userId, dbClient }` tuple for owner-scoped queries.
- `scope.params` is the resolved Next route params object.
- `scope.req` remains the original request object.
- `requestBoundary.route` must remain compatible with `withErrorBoundary`.
- Confirm `src/app/api/v1/user/profile/route.ts` still preserves `users.authUserId` writes and clock-sensitive `updatedAt: sql<Date>\`now()\`` behavior before refactoring it.

### Step 1.0 — Add Route Options Instead Of More Helper Bags

Extend `requestBoundary.route` so route-owned preflight can be expressed at the boundary call site without reintroducing wrapper-choice knowledge:

```ts
requestBoundary.route(
  { rateLimit: 'read' },
  async ({ req, actor, db, owned, params }) => {
    // route logic
  },
)
```

Recommended shape:

- Support the existing one-argument form while migrating (`route(run)`).
- Add an options overload such as `route(options, run)` with `rateLimit?: UserRateLimitCategory`.
- Extract a lower-level user-rate-limit response helper from `withRateLimit` (for example `applyUserRateLimitHeaders(response, userId, category)`) so `requestBoundary.route` can reuse exact header behavior instead of duplicating it.
- Apply user-rate limiting after auth resolution and before route work by reusing that extracted helper plus the existing `checkUserRateLimit` flow.
- Keep generation-specific quota/rate-limit checks out of the generic boundary. `checkPlanGenerationRateLimit` returns domain-specific headers and should remain route/domain-owned unless a later plan extracts an AI-generation route boundary.

Avoid adding custom route-specific fields to the generic scope. If a route needs parsed body, owned plan, or generation attempt number, keep that in route/domain helpers for now.

### Step 2.0 — Tighten Plan Route Helpers Around Scope

Keep `src/features/plans/api/route-context.ts`, but stop making routes pass facts already present in `RouteScope`.

Add or adjust helpers only if they remove repeated route plumbing:

- `requirePlanIdFromRequest(req, position)` can stay if the implementation pass does not want to depend on `params` yet.
- Keep `requireOwnedPlanById({ planId, ownerUserId, dbClient })` as the plan-specific owned-plan helper; only adapt call sites or narrow wrappers if that clearly reduces repeated explicit args.
- Remove `requireInternalUserByAuthId` from migrated callers where `scope.actor` already is the internal user row.
- Do not pass generic `RouteScope` into plan helpers; keep helper inputs explicit so `route-context.ts` stays plan-domain-specific.

Do not turn `route-context.ts` into a second boundary. It should stay plan-specific.

### Step 3.0 — Migrate Simple Representative Routes

Migrate these first because they prove the generic boundary without dragging in streaming behavior:

- `src/app/api/v1/resources/route.ts`
- `src/app/api/v1/user/profile/route.ts`
- `src/app/api/v1/plans/route.ts`
- `src/app/api/v1/plans/[planId]/route.ts`
- `src/app/api/v1/plans/[planId]/tasks/route.ts`
- `src/app/api/v1/plans/[planId]/status/route.ts`
- `src/app/api/v1/plans/[planId]/attempts/route.ts`

Expected route code after migration:

- Import `requestBoundary` instead of `withAuthAndRateLimit`.
- Use `scope.actor` instead of separate `user` / `userId` names.
- Use `scope.db` or `scope.owned` instead of `getDb()` where routes currently call it.
- `src/app/api/v1/plans/[planId]/attempts/route.ts` already avoids direct `getDb()` calls, so expect mostly wrapper/actor cleanup there.
- Keep validation, response shape, logging, and query behavior unchanged.
- Keep `withErrorBoundary` as the outer wrapper.

### Step 4.0 — Migrate One Generation Entry Point If The Shape Holds

After simple routes pass, migrate exactly one generation route to prove the boundary can coexist with route-owned preflight:

Preferred candidate: `src/app/api/v1/plans/[planId]/regenerate/route.ts`.

Reason:

- It uses `aiGeneration` user-rate limiting through `withAuthAndRateLimit`.
- It delegates generation quota and queue decisions to `requestPlanRegeneration`.
- It returns normal JSON, not a streaming response.
- It already avoids direct `getDb()` calls, so migration can stay focused on boundary/wrapper behavior instead of forcing synthetic DB changes.
- It is less risky than `stream` or `retry` while still proving an AI-generation category route.

Defer `stream` and `retry` unless Step 4.0 exposes a boundary flaw that can only be validated there. Those routes have separate plan-generation-session complexity, Sentry behavior, and SSE response semantics. Pulling them into the first pass is scope creep.

### Step 5.0 — Tests

Boundary-level tests:

- Add `requestBoundary.route({ rateLimit })` tests for authenticated routes.
- Assert route scope still includes `req`, `params`, `actor`, `db`, `owned`, and `correlationId`.
- Assert standard user-rate-limit headers are applied.
- Assert unauthenticated routes do not run route work.
- Assert optionless `route(run)` remains compatible during migration.
- Assert `withErrorBoundary(requestBoundary.route(...))` still composes cleanly and preserves current error-boundary behavior.

Route tests:

- Update route tests that mock auth wrappers only because of `withAuthAndRateLimit` closure behavior.
- Keep route tests focused on request validation, response status/body, and observable headers.
- Do not rewrite generation-session tests around the request boundary; they should stay domain-boundary tests.

Integration/contract coverage:

- Run existing plan API contract tests for migrated plan routes.
- Run user profile coverage because `PUT /api/v1/user/profile` updates `users.authUserId` and has clock-sensitive `updatedAt: sql<Date>\`now()\`` behavior.
- Add focused unit or integration coverage for `src/app/api/v1/resources/route.ts` type filtering and pagination behavior.

### Step 6.0 — Validation

Minimum final validation for implementation:

- Focused unit: `pnpm exec vitest run tests/unit/api/request-boundary.spec.ts`
- Focused route/API tests for migrated routes.
- Plan route contracts/integration tests touching migrated files.
- `pnpm test:changed`
- `pnpm check:full`

If `pnpm test:changed` fails because Docker/Testcontainers is unavailable, record that as environment evidence and run the most targeted unit/integration subset possible. Do not present that as full validation.

### Step 7.0 — Issue Verification And Closure

Before closing issue `#312`, verify:

- Representative routes use `requestBoundary.route`.
- Migrated routes no longer call `getDb()` directly.
- Migrated routes no longer import `withAuthAndRateLimit`.
- Rate-limit behavior and headers are preserved.
- `RouteScope` exposes enough data for params, actor, db, route-owned preflight, and internal/auth id distinctions.
- Tests prove authenticated and unauthenticated route behavior.
- Record targeted `rg "withAuthAndRateLimit|getDb\\(" ...` evidence for migrated files so wrapper and DB-call removal claims stay concrete.

Close the issue only after the implementing PR is merged or the user explicitly asks to close it earlier.

## Risks

- Rate-limit behavior can drift if `requestBoundary.route` reimplements `withRateLimit` incorrectly. Prefer extracting reusable rate-limit application logic from `middleware.ts` instead of duplicating header behavior.
- The internal user id vs auth-provider user id distinction is easy to blur. The plan must keep `actor.id` and `actor.authUserId` explicit in code names where both are needed.
- Streaming generation routes are tempting because they expose all complexity at once. Migrating them in the first pass risks turning a boundary cleanup into a generation-session rewrite.
- `route-context.ts` can become a second request boundary if it grows generic auth/db concerns. Keep it plan-domain-specific.

## Non-Goals

- Do not delete `withAuth`, `withAuthAndRateLimit`, or `withRateLimit` in this pass.
- Do not migrate every API route under `src/app/api/v1/**`.
- Do not move proxy or route-protection logic out of `src/proxy.ts`.
- Do not change public API response shapes.
- Do not redesign plan-generation-session, regeneration orchestration, or billing/Stripe boundaries.
- Do not alter RLS privilege posture.

## Open Questions

- Should route params become the preferred source of path ids immediately, or should `requirePlanIdFromRequest` stay for the representative migration? Current recommendation: keep the helper initially and revisit once `params` usage is proven.
- What exact shared helper signature should Step 1.0 use for user-rate-limit response headers? Current recommendation: keep extraction in `src/lib/api/middleware.ts` and prefer `applyUserRateLimitHeaders(response, userId, category)` so both `withRateLimit` and `requestBoundary.route` reuse one path.
- Should `requestBoundary.route` expose `authUserId` as a top-level scope field? Current recommendation: no; use `actor.authUserId` unless repeated migrated routes show that verbosity is harming clarity.
