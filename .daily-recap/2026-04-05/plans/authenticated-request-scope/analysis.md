# Authenticated Request Scope — Analysis

> Steps 1.1–1.4 of the planning sequence. This document captures the lifecycle matrix, ambiguity analysis, surface decisions, and `getDb()` contract — the inputs needed to resolve the decision tree and draft an implementation plan.

## 1. Lifecycle End-to-End (Step 1.1)

The authenticated request scope lifecycle has six stages. In production, all six happen inside `runWithAuthenticatedContext()` (`auth.ts:147-170`). In tests, different wrappers skip different stages.

### Lifecycle stages

```
1. Auth identity resolution
   getEffectiveAuthUserId() → resolves authUserId
   - Vitest: returns DEV_AUTH_USER_ID
   - Dev with override: returns DEV_AUTH_USER_ID
   - Production: reads Neon Auth session

2. User-record provisioning
   ensureUserRecord(authUserId, dbClient?) → DbUser
   - Looks up user by authUserId
   - Creates user from session data if missing
   - In localProductTesting mode: throws if not seeded

3. RLS client creation
   createAuthenticatedRlsClient(authUserId) → { db, cleanup }
   - Opens a non-pooled postgres connection
   - SET ROLE authenticated (drops BYPASSRLS)
   - set_config('request.jwt.claims', '{"sub":"<authUserId>"}', false)
   - Returns Drizzle client + idempotent cleanup

4. Request context installation
   createRequestContext(req, { userId, db, cleanup }) → RequestContext
   withRequestContext(ctx, fn) → AsyncLocalStorage.run(ctx, fn)
   - Stores correlationId, userId, user, db, cleanup in ALS

5. getDb() resolution
   getDb() in runtime.ts:24
   - isTest → serviceDb (bypasses everything above)
   - else → getRequestContext()?.db or throw

6. Cleanup
   cleanup() → sql.end({ timeout: 5 })
   - Called in finally block of runWithAuthenticatedContext
   - Idempotent (safe to call multiple times)
```

### Which wrappers execute which stages

| Stage | `withAuth` (prod) | `withAuth` (test) | `withServerComponentContext` (prod) | `withServerComponentContext` (test) | `withServerActionContext` (prod) | `withServerActionContext` (test†) | `getCurrentUserRecordSafe` | `getEffectiveAuthUserId` |
|---|---|---|---|---|---|---|---|---|
| 1. Auth identity | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 2. User record | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| 3. RLS client | Yes | **No** | Yes | **No** | Yes | Yes | Yes (own) | No |
| 4. Request context | Yes | **Partial** (no db/cleanup) | Yes | **No** | Yes | Yes | No | No |
| 5. getDb() works | Yes | Via isTest bypass | Yes | Via isTest bypass | Yes | Yes | No | No |
| 6. Cleanup | Yes | No (nothing to clean) | Yes | No | Yes | Yes | Own cleanup | No |

† `withServerActionContext` has no `isTest` branch — it always runs the full `runWithAuthenticatedContext` path.

### Verified caller surface matrix

| Export | Category | External callers | Call pattern |
|---|---|---|---|
| `withAuthAndRateLimit` | Active wrapper (composed) | 19 | API route handlers |
| `withAuth` | Active wrapper | 1 | API route handler |
| `withServerComponentContext` | Active wrapper | 7 (6 files) | Server components |
| `withServerActionContext` | Active wrapper | 7 (2 files) | Server actions |
| `withErrorBoundary` | Composition helper (orthogonal) | 22 (18 files) | API route handlers |
| `withRateLimit` | Composition helper (orthogonal) | 0 direct (used via `withAuthAndRateLimit`) | — |
| `getEffectiveAuthUserId` | Escape hatch | 1 (`src/app/page.tsx`) | Redirect-only check |
| `getAuthUserId` | Internal-only | 0 external | — |
| `requireUser` | Internal-only | 0 external | — |
| `requireCurrentUserRecord` | Internal-only | 0 external | — |
| `getCurrentUserRecordSafe` | Dead code | 0 external | — |
| `getDb()` | Ambient DB access | ~40-56 (see below) | Default params, direct calls |

### `getDb()` call-site classification

| Category | Count | Description | Migration impact |
|---|---|---|---|
| A: Inside wrapper-protected paths | ~16 | Direct `getDb()` call inside a route/action/component that is wrapped | Low — context guaranteed |
| B: Default parameter fallback | ~37 | `db = getDb()` as default param in query/helper functions | Medium — the `getDb()` default would need to change if ambient access changes |
| C: DI-style `deps.getDb()` | 3 | `src/lib/db/queries/users.ts` | Medium — already DI, but still calls getDb |
| D: Required explicit dbClient | varies | `attempts.ts` and similar RLS-sensitive modules | None — already explicit |

---

## 2. Ambiguity and Contradiction Analysis (Step 1.2)

### Ambiguity 1: Wrapper choice still requires caller knowledge

**Where:** `auth.ts:183-262`

The three wrappers (`withAuth`, `withServerComponentContext`, `withServerActionContext`) have different:
- Signatures (Request + RouteHandlerContext vs. just a callback)
- Return types (Response vs. T | null)
- Callback args (user only vs. user + rlsDb)
- Test behavior (skip RLS vs. skip everything vs. skip nothing)

The **right** wrapper depends on the calling context (API route vs. server component vs. server action), which is inherent to Next.js. This is not a design flaw — it reflects real framework constraints. The actual design question is whether the shared core (`runWithAuthenticatedContext`) should be exposed as a single entry point with adapters, or kept as the current three named wrappers.

**Misuse mode:** A new contributor uses the wrong wrapper for a given context. But with 0 callers on `getCurrentUserRecordSafe` and clear naming (`withServerActionContext` for server actions), the current names are reasonably self-documenting. The real risk was the old `getCurrentUserRecordSafe` escape hatch, which is now dead code.

### Ambiguity 2: `authUserId` vs `user.id`

**Where:** `auth.ts:69-109`, `context.ts:8-11`

Two identity concepts coexist:
- `authUserId` = external identity from Neon Auth (string, stored as `users.auth_user_id`)
- `user.id` = internal DB primary key (string UUID)

These are unified at the `ensureUserRecord` boundary: `authUserId` goes in, `DbUser` comes out. The request context stores both (`userId` = authUserId, `user.id` = internal id).

**Misuse mode:** Passing `user.id` where `authUserId` is expected, or vice versa. However, this is documented in `docs/architecture/auth-and-data-layer.md:50-70`, and the type system partially guards it (different field names). This is a low-severity paper cut, not a structural flaw.

### Ambiguity 3: When `getDb()` is legal vs. when explicit `dbClient` is required

**Where:** `runtime.ts:24`, `src/lib/db/AGENTS.md` (client selection table)

The rule is:
- Inside a wrapper → `getDb()` works (returns RLS-scoped client from context)
- In tests → `getDb()` works (returns serviceDb)
- Outside both → `getDb()` throws

But some query modules require an explicit `dbClient` parameter (e.g., `attempts.ts`) while most default to `getDb()`. The difference is documented in `src/lib/db/AGENTS.md` under "RLS-sensitive query modules" but is not enforced by the type system.

**Misuse mode:** A developer adds a new query module, defaults to `getDb()`, and it works in tests but fails at runtime because the caller isn't inside a wrapper. The fail-closed `MissingRequestDbContextError` catches this, so the real risk is wasted debugging time, not a security hole.

### Ambiguity 4: Test behavior divergence

**Where:** `auth.ts:189-197`, `auth.ts:232-239`, `runtime.ts:27-29`, `service-role.ts:94-98`

Five `isTest` branches exist with four different behaviors:

| Branch | What it skips |
|---|---|
| `withAuth` test path | Skips RLS client, creates partial request context (no db, no cleanup) |
| `withServerComponentContext` test path | Skips RLS client AND request context entirely |
| `getCurrentUserRecordSafe` test path | Skips RLS client (creates user with serviceDb) |
| `getDb()` test path | Returns serviceDb regardless of context |
| `service-role.ts` test path | Uses nonPoolingUrl instead of normal URL |

The divergence means:
- Tests never exercise RLS enforcement through the wrapper path
- `withAuth` tests get a request context (so `getRequestContext()` works) but no RLS db in it
- `withServerComponentContext` tests get neither context nor RLS db
- Both rely on `getDb()` returning serviceDb to make queries work

This is **intentional convenience** (RLS is tested separately via dedicated RLS security tests) but it means the wrapper test paths are structurally different from production in ways that could mask real bugs.

### Contradiction 1: `withServerActionContext` has no isTest branch but the others do

`withServerActionContext` (`auth.ts:255-262`) always calls `runWithAuthenticatedContext`, including in tests. This means server action tests create real RLS clients and request contexts, while server component tests skip them entirely. This asymmetry is undocumented and could confuse contributors who expect uniform test behavior.

### Contradiction 2: Docs say `getCurrentUserRecordSafe` is valid; learnings say don't use it

**Now fixed.** The learnings.md rule was updated in the audit. But `getCurrentUserRecordSafe` is still exported from `auth.ts` and its JSDoc (`auth.ts:116-122`) still describes it as a valid lightweight alternative. The function should either be removed or have its JSDoc updated to mark it as deprecated.

### Contradiction 3: `src/lib/db/AGENTS.md` says `getDb()` for "API routes, server actions" but it also works in server components

The AGENTS.md client selection table says:
- `getDb()` from `@/lib/db/runtime` for "API routes, server actions"
- `db` from `@/lib/db/service-role` for "Tests, workers, migrations"

But `getDb()` also works inside `withServerComponentContext` in production. The table omits server components. This is a documentation gap, not a code bug.

---

## 3. Exported Surface Decisions (Step 1.3)

### Decision: `getCurrentUserRecordSafe` → Remove

**Rationale:**
- 0 external callers
- Caused the pricing regression on 2026-04-01
- JSDoc still describes it as a valid alternative, which is misleading
- The pricing test `page.spec.tsx:115-117` explicitly asserts it's not called — removing the function makes that test unnecessary
- Removing is cleaner than deprecating since there are no callers to migrate

**Migration cost:** Remove the export, remove the JSDoc, remove the pricing test assertions that guard against its use. ~3 files touched.

### Decision: `getEffectiveAuthUserId` → Keep as escape hatch

**Rationale:**
- 1 caller (`src/app/page.tsx:6`) for redirect-only logic
- Does not need user record, request context, or DB access
- Correctly scoped for its purpose
- Making it private would force `src/app/page.tsx` to use a heavier wrapper for a simple auth check

### Decision: `withErrorBoundary`, `withRateLimit` → Separate from auth scope

**Rationale:**
- `withErrorBoundary` (22 callers) and `withRateLimit`/`withAuthAndRateLimit` are composition helpers, not auth-scope primitives
- They happen to live in `auth.ts` but are orthogonal to the auth/RLS/context concern
- Any refactor of auth scope should not change these helpers' behavior or API
- They should be extracted to their own module as part of the refactor to reduce `auth.ts` surface area

**Migration cost:** Move `withErrorBoundary` to a new file (e.g., `src/lib/api/error-boundary.ts`). Update 18 import paths. Move `withRateLimit` to `src/lib/api/rate-limit.ts` or keep it co-located with `withAuthAndRateLimit`. Low risk, mechanical change.

### Decision: Internal-only helpers → Keep internal, no change

`getAuthUserId`, `requireUser`, `requireCurrentUserRecord` have 0 external callers. They serve the wrappers internally. No action needed.

### Target exported surface after cleanup

```
src/lib/api/auth.ts (auth scope boundary):
  - withAuth                    → API routes
  - withAuthAndRateLimit        → API routes (composed convenience)
  - withServerComponentContext  → Server components
  - withServerActionContext     → Server actions
  - getEffectiveAuthUserId      → Redirect-only escape hatch

src/lib/api/error-boundary.ts (new, extracted):
  - withErrorBoundary           → Error handling composition

src/lib/api/rate-limit.ts (new or existing):
  - withRateLimit               → Rate limiting composition

Types still re-exported from auth.ts:
  - PlainHandler, RouteHandlerContext
```

---

## 4. `getDb()` Contract and Test-Runtime Decision (Step 1.4)

### Current contract

```typescript
// runtime.ts:24
export function getDb(): typeof serviceDb {
  if (appEnv.isTest) return serviceDb;         // always works
  const ctx = getRequestContext();
  const requestDb = ctx?.db;
  if (requestDb) return requestDb;             // RLS-scoped
  throw new MissingRequestDbContextError();    // fail-closed
}
```

### Call-site blast radius

- **Category A** (~16 sites): Direct calls inside wrapper-protected handlers. These already have context. If `getDb()` contract stays ambient, no change needed. If made explicit, these would receive `db` from the wrapper callback.
- **Category B** (~37 sites): Default parameter fallbacks like `db = getDb()`. These are the bulk of the migration surface. They work because the caller is inside a wrapper. If `getDb()` is removed, every calling function signature changes.
- **Category C** (3 sites): DI-style `deps.getDb()` in `users.ts`. Already injected, would need the injected function to change.
- **Required explicit** (e.g., `attempts.ts`): Already explicit, no impact.

### Decision: Keep ambient `getDb()`, do not change the contract

**Rationale:**
- ~37 default-parameter sites would need migration if `getDb()` becomes explicit. That's a large, mechanical change with no security benefit — the fail-closed design already prevents misuse at runtime.
- The `isTest` bypass is intentional and well-understood. RLS correctness is verified by dedicated RLS security tests, not by running every unit test through RLS.
- Making DB access explicit in every query function would add ceremony without improving safety, since the wrappers already guarantee the context exists.
- The real problem is not `getDb()` itself — it's that the wrappers have inconsistent test paths. Fixing the test paths is higher value than changing the DB access pattern.

### Decision: Converge `isTest` branches toward one pattern

**Current state:** Three different test-mode behaviors across four branches:

| Wrapper | Test behavior |
|---|---|
| `withAuth` | Partial context (userId, user) but no db, no cleanup |
| `withServerComponentContext` | No context at all, just user record |
| `withServerActionContext` | Full context (no test branch) |
| `getDb()` | serviceDb always |

**Target:** Align `withAuth` and `withServerComponentContext` test branches to match `withServerActionContext` — always run through `runWithAuthenticatedContext` in all environments.

**Why:**
- `withServerActionContext` already works in tests without a special branch. This proves the pattern is viable.
- Removing the `isTest` branches from `withAuth` and `withServerComponentContext` means tests exercise the real request-context creation path, catching context-dependent bugs earlier.
- Tests would still use `serviceDb` via `getDb()` for query-module calls (that branch stays), but the *wrappers* would set up real context.

**Migration cost:**
- `withAuth` test branch (`auth.ts:189-197`): Remove the branch. Tests that call API routes through `withAuth` would now create RLS clients. This requires the test database to support `SET ROLE authenticated` and `set_config`. If the test DB doesn't support this, we need a test-mode RLS client that skips the real connection setup but still installs request context.
- `withServerComponentContext` test branch (`auth.ts:232-239`): Remove the branch. Same consideration as above.
- `getCurrentUserRecordSafe` test branch (`auth.ts:129-131`): Removed with the function deletion.

**Risk:** Creating real RLS connections in tests may slow down the test suite or require test-infrastructure changes. Evaluate this during implementation by running the test suite with the branches removed and measuring impact.

**Fallback:** If real RLS connections in tests are too slow or brittle, replace the three different `isTest` branches with one shared test-mode path that creates a proper request context with `serviceDb` but without a real RLS connection. This is still better than the current three-way divergence.

---

## 5. Resolved Decision Tree (Step 1.5)

### Branch 1: One boundary vs. multiple specialized boundaries

**Decision: Keep multiple specialized wrappers.**

Rationale:
- The three wrappers (`withAuth`, `withServerComponentContext`, `withServerActionContext`) map 1:1 to real Next.js calling contexts with genuinely different signatures and return types.
- `withAuth` receives `(req, routeContext)` and returns `Response`.
- `withServerComponentContext` receives a callback `(user) => T` and returns `T | null`.
- `withServerActionContext` receives a callback `(user, rlsDb) => T` and returns `T`.
- Collapsing these into one entry point would either lose type safety or require callers to pass a discriminant.
- All three already delegate to the same private core (`runWithAuthenticatedContext`). The boundary is already unified internally.

### Branch 2: Callback wrappers vs. explicit session object

**Decision: Keep callback wrappers.**

Rationale:
- The callback pattern enforces cleanup via `finally` blocks — the caller cannot forget to clean up the RLS connection.
- An explicit session object (`const session = await createAuthSession()`) would require callers to manage their own cleanup, which is more error-prone.
- The current callback pattern works well and has no ergonomic complaints from existing callers.
- Switching to a session-object pattern would touch 35+ call sites with no safety benefit.

### Branch 3: Keep route/action/component-specific wrappers vs. collapse

**Decision: Keep specific wrappers. They are thin adapters over the shared core.**

This is a corollary of Branch 1. The wrappers are already minimal (5-15 lines each). Collapsing them would add complexity, not remove it.

### Branch 4: Preserve or reduce ambient `getDb()`

**Decision: Preserve `getDb()` as-is.**

Rationale:
- 40-56 call sites depend on ambient access.
- The fail-closed design (`MissingRequestDbContextError`) catches misuse at runtime.
- Making DB access explicit across ~37 default-parameter sites would be a large mechanical change with no security benefit.
- `getDb()` in tests returning `serviceDb` is the desired behavior — tests should not need request context just to call query helpers.

### Branch 5: isTest branch strategy

**Decision: Unified test context (user's choice).**

Replace the divergent `isTest` branches in `withAuth` and `withServerComponentContext` with one shared test-mode path that:
1. Resolves the auth identity and user record (as today).
2. Creates a proper `RequestContext` with `serviceDb` as the `db` field and a no-op `cleanup`.
3. Runs the callback inside `withRequestContext` (as production does).
4. Does NOT create a real RLS connection (avoids test-infrastructure dependency).

This gives tests:
- A real `RequestContext` (so `getRequestContext()` works in all code paths).
- `serviceDb` as the context DB (so `getDb()` returns the same thing whether called via context or via its own `isTest` branch).
- Consistent behavior across all three wrappers.
- No real Postgres `SET ROLE` ceremony (fast, no connection overhead).

The `getDb()` `isTest` branch in `runtime.ts` stays unchanged — it's a belt-and-suspenders fallback for code that calls `getDb()` outside of any wrapper, which is valid in tests.

### Summary of decisions

| Decision | Choice | Migration cost |
|---|---|---|
| Boundary structure | Keep 3 wrappers + shared core | None |
| Caller pattern | Keep callback wrappers | None |
| `getDb()` contract | Keep ambient, fail-closed | None |
| `isTest` branches | Unified test context | ~3 files in auth.ts, test helpers |
| Dead code (`getCurrentUserRecordSafe`) | Remove | ~3 files |
| Orthogonal helpers (`withErrorBoundary`) | Extract to own module | ~18 import paths |
| `getEffectiveAuthUserId` | Keep as escape hatch | None |
| `src/lib/db/AGENTS.md` | Update to include server components | 1 file |
