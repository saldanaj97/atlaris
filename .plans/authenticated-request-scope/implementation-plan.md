# Authenticated Request Scope — Implementation Plan

> Step 1.6 output. This is the execution-ready plan produced from the resolved decision tree in [analysis.md](./analysis.md). Each slice is independently shippable, ordered by dependency and risk.

## Goal

Reduce the caller-facing surface of authenticated request scope so developers no longer need tribal knowledge about wrapper selection or test-mode behavior divergence. The architecture is sound; the exported surface and test hygiene are not.

## Design Decisions (from analysis.md §5)

| Decision | Choice |
|---|---|
| Boundary structure | Keep 3 wrappers + shared core |
| Caller pattern | Keep callback wrappers |
| `getDb()` contract | Keep ambient, fail-closed |
| `isTest` branches | Unified test context (serviceDb in real RequestContext, no RLS ceremony) |
| Dead code | Remove `getCurrentUserRecordSafe` |
| Orthogonal helpers | Extract `withErrorBoundary`, `withRateLimit` to own module |
| Escape hatch | Keep `getEffectiveAuthUserId` for redirect-only use |
| Docs | Update `src/lib/db/AGENTS.md` and `docs/architecture/auth-and-data-layer.md` |

---

## Slice 1: Remove dead code (`getCurrentUserRecordSafe`)

**Why first:** Zero callers, zero risk, simplifies all subsequent work.

### Step 1.0 — Confirm current state

```bash
rg "getCurrentUserRecordSafe" src/ --type-add 'src:*.{ts,tsx}' -t src
```

Expected: Only `src/lib/api/auth.ts` (definition) and the pricing test mock.

### Step 1.1 — Delete the function

- **File:** `src/lib/api/auth.ts:116-141`
- Remove the `getCurrentUserRecordSafe` export and its JSDoc.
- Remove the associated type export if any.

### Step 1.2 — Update the pricing page test

- **File:** `tests/unit/app/pricing/page.spec.tsx`
- Lines 10-26: Remove the `getCurrentUserRecordSafe` mock setup from `vi.hoisted()`.
- Lines 115-117: Remove the `beforeEach` assertion that throws if `getCurrentUserRecordSafe` is called.
- Lines 132-133: Remove the assertion that `getCurrentUserRecordSafe` was NOT called.
- The `withServerComponentContext` mock and assertions remain.

### Step 1.3 — Update the auth unit test

- **File:** `tests/unit/api/auth.spec.ts`
- Remove any direct tests of `getCurrentUserRecordSafe` behavior.
- Keep all other auth tests.

### Validation

```bash
# Verify no remaining references in src/
rg "getCurrentUserRecordSafe" src/ --type-add 'src:*.{ts,tsx}' -t src

# Verify tests pass
pnpm test:changed

# Verify no remaining references in test files (except historical docs)
rg "getCurrentUserRecordSafe" tests/
```

---

## Slice 2: Extract orthogonal helpers (`withErrorBoundary`, `withRateLimit`)

**Why second:** Reduces `auth.ts` to pure auth-scope concerns. 22 import paths change, but the function signatures don't.

### Step 2.0 — Confirm the extraction candidates

```typescript
// These have NOTHING to do with auth scope:
withErrorBoundary(handler)   // auth.ts:209-218 — wraps handler in try/catch
withRateLimit(handler, opts) // auth.ts:264-286 — rate limiting decorator

// This composes them — must be updated:
withAuthAndRateLimit(handler, opts) // auth.ts:288-293
```

### Step 2.1 — Create `src/lib/api/middleware.ts`

Move `withErrorBoundary` and `withRateLimit` into a new module. Keep exact same signatures and behavior.

```typescript
// src/lib/api/middleware.ts
export function withErrorBoundary(handler: PlainHandler): PlainHandler { ... }
export function withRateLimit(handler: PlainHandler, opts: RateLimitOptions): PlainHandler { ... }
```

Also move the `PlainHandler` type and `RouteHandlerContext` type here if they're only used by these functions. If they're used by `withAuth` too, keep them in `auth.ts` or a shared types file.

### Step 2.2 — Update `withAuthAndRateLimit` in `auth.ts`

Import `withErrorBoundary` and `withRateLimit` from `@/lib/api/middleware` and compose as before. `withAuthAndRateLimit` stays in `auth.ts` because it depends on `withAuth`.

### Step 2.3 — Update 18 import sites

All 22 callers of `withErrorBoundary` currently import from `@/lib/api/auth`. Update to `@/lib/api/middleware`.

**Files to update** (from audit):
- `src/app/api/v1/stripe/create-checkout/route.ts`
- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/app/api/v1/user/subscription/route.ts`
- `src/app/api/v1/plans/stream/route.ts`
- `src/app/api/v1/stripe/webhook/route.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`
- `src/app/api/v1/user/preferences/route.ts`
- `src/app/api/v1/plans/route.ts`
- `src/app/api/v1/plans/[planId]/status/route.ts`
- `src/app/api/v1/user/profile/route.ts`
- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/app/api/v1/plans/[planId]/retry/route.ts`
- `src/app/api/v1/plans/[planId]/tasks/route.ts`
- `src/app/api/v1/plans/[planId]/regenerate/route.ts`
- `src/app/api/v1/plans/[planId]/route.ts`
- `src/app/api/v1/plans/[planId]/attempts/route.ts`
- `src/app/api/internal/jobs/regeneration/process/route.ts`
- `src/app/api/v1/resources/route.ts`

### Step 2.4 — Re-export from `auth.ts` for backward compatibility (optional, remove later)

If there are external consumers or tests that import these from `auth.ts`, add temporary re-exports:

```typescript
// In auth.ts — TEMPORARY, remove in next PR
export { withErrorBoundary, withRateLimit } from './middleware';
```

### Validation

```bash
# Type check
pnpm exec tsc --noEmit

# Verify no direct withErrorBoundary/withRateLimit in auth.ts (except re-export or composition)
rg "withErrorBoundary|withRateLimit" src/lib/api/auth.ts

# Run affected tests
pnpm test:changed

# Verify import consistency
rg "from '@/lib/api/auth'" src/app/api/ | rg "withErrorBoundary|withRateLimit"
# Should return nothing (or only the temporary re-export)
```

---

## Slice 3: Unify `isTest` branches

**Why third:** This is the highest-value change. After this, all three wrappers behave consistently in tests by running through a shared test-mode path.

### Step 3.0 — Understand the target state

**Current:** Three different `isTest` branches with divergent behavior.
**Target:** One shared test-mode path used by all wrappers:

```typescript
// New private helper in auth.ts
async function runWithTestContext<T>(
  callback: (user: DbUser, db: typeof serviceDb) => T | Promise<T>
): Promise<T> {
  const authUserId = await getEffectiveAuthUserId();
  const user = await ensureUserRecord(authUserId);
  const ctx = createRequestContext(
    null, // no real request in tests
    {
      userId: user.id,
      user,
      db: serviceDb,        // service-role DB, no RLS ceremony
      cleanup: () => {},     // no-op, nothing to clean up
    }
  );
  return withRequestContext(ctx, () => callback(user, serviceDb));
}
```

### Step 3.1 — Create `runWithTestContext` in `auth.ts`

- Add the helper as a private function (not exported).
- Import `serviceDb` from `@/lib/db/service-role` (already available in tests).
- Import `createRequestContext` from `@/lib/api/context`.

**Critical:** `createRequestContext` accepts `req: Request | undefined` (verified at `context.ts:86-88`). Passing `undefined` generates a UUID correlation ID — no synthetic request needed.

### Step 3.2 — Replace `withAuth` test branch

- **File:** `src/lib/api/auth.ts:189-197`
- **Current:** Resolves user, creates partial context (userId, user, no db, no cleanup), runs handler.
- **New:** Call `runWithTestContext`, then call the handler with the result.

```typescript
// Before (simplified)
if (appEnv.isTest) {
  const authUserId = await getEffectiveAuthUserId();
  const user = await ensureUserRecord(authUserId);
  const ctx = createRequestContext(request, { userId: user.id, user });
  return withRequestContext(ctx, () => handler(request, routeContext, user));
}

// After
if (appEnv.isTest) {
  return runWithTestContext(async (user) => {
    // handler expects (request, routeContext, user) and returns Response
    return handler(request, routeContext, user);
  });
}
```

**Note:** `withAuth`'s handler receives `request` and `routeContext` — these still come from the outer scope, not from the test context. Only the auth/DB context is unified.

### Step 3.3 — Replace `withServerComponentContext` test branch

- **File:** `src/lib/api/auth.ts:232-239`
- **Current:** Resolves user, returns `resolver(user)` directly, no context.
- **New:**

```typescript
// Before
if (appEnv.isTest) {
  const authUserId = await getEffectiveAuthUserId();
  if (!authUserId) return null;
  const user = await ensureUserRecord(authUserId);
  return resolver(user);
}

// After
if (appEnv.isTest) {
  const authUserId = await getEffectiveAuthUserId();
  if (!authUserId) return null;
  return runWithTestContext(async (user) => resolver(user));
}
```

### Step 3.4 — Remove `getCurrentUserRecordSafe` test branch (already done in Slice 1)

This is a no-op if Slice 1 is already applied. The function and its test branch are both deleted.

### Step 3.5 — Verify `getDb()` still works in unified context

In the test-mode path, `runWithTestContext` installs `serviceDb` into request context. `getDb()` has its own `isTest` branch returning `serviceDb`. Both return the same thing. The `getDb()` branch is belt-and-suspenders — it still works for code outside a wrapper (e.g., top-level query helpers in tests).

```bash
# Verify getDb() returns serviceDb in both paths
# This is a correctness check, not a code change
```

### Step 3.6 — Update test helpers if needed

**`tests/mocks/shared/auth-server.ts`:** No change needed. This mocks `auth.getSession`, not the wrappers.

**`tests/helpers/auth.ts`:** No change needed. `setTestUser` / `clearTestUser` set `DEV_AUTH_USER_ID`, which `getEffectiveAuthUserId()` reads. This still works in the unified path.

**Test files mocking wrappers directly:**
- `tests/unit/app/pricing/page.spec.tsx` — mocks `withServerComponentContext`. After Slice 1 cleanup, verify this still works. The mock invokes the resolver callback, which is the same contract.
- `tests/unit/app/plans/actions.spec.ts` — mocks `withServerActionContext`. No change (this wrapper already has no `isTest` branch).

### Validation

```bash
# Type check
pnpm exec tsc --noEmit

# Run ALL tests (this change affects every wrapper, not just changed files)
pnpm test

# Run integration tests (these exercise the real wrappers in test mode)
pnpm test:integration

# Verify no remaining isTest branches in auth.ts (except the unified runWithTestContext)
rg "isTest" src/lib/api/auth.ts
# Expected: only inside runWithTestContext (or the callers' single `if (appEnv.isTest)` guard)
```

---

## Slice 4: Update documentation

### Step 4.1 — Update `docs/architecture/auth-and-data-layer.md`

- Remove any mention of `getCurrentUserRecordSafe`.
- Add `withErrorBoundary` / `withRateLimit` extraction note — they are now in `@/lib/api/middleware`.
- Note the unified test behavior.

### Step 4.2 — Update `src/lib/db/AGENTS.md`

- Line 13-14: Add server components to the client-selection table.
- Update the "Auth Wrappers" section to note that `withErrorBoundary` and `withRateLimit` are now in `@/lib/api/middleware`.

### Step 4.3 — Update `docs/agent-context/learnings.md`

- Line 23 was already corrected in the audit fixes.
- Verify it still reads correctly after all the code changes.

### Step 4.4 — Update `docs/testing/test-standards.md` if it references auth mocking patterns

- Check whether the unified test context changes any documented test pattern.

### Validation

```bash
# Verify no stale references to deleted function in docs
rg "getCurrentUserRecordSafe" docs/

# Verify docs reference the correct import paths
rg "from.*api/auth.*withErrorBoundary" docs/
# Expected: nothing (docs should reference @/lib/api/middleware now)
```

---

## Slice 5: Update `todos.md` and close planning items

### Step 5.1 — Mark all todos complete

Update `.plans/authenticated-request-scope/todos.md` with completion status for all items resolved by this work.

### Step 5.2 — Add review section

Add a review section to `todos.md` summarizing:
- What was decided
- What was implemented
- What was deferred (if anything)
- Lessons learned

### Step 5.3 — Update `.plans/lessons.md` if new patterns emerged

---

## Sequencing and Dependencies

```
Slice 1 (dead code removal)
    ↓
Slice 2 (extract orthogonal helpers)  ← independent of Slice 1, but cleaner after
    ↓
Slice 3 (unify isTest branches)       ← depends on Slice 1 (no dead code isTest branch)
    ↓
Slice 4 (docs)                         ← depends on Slices 1-3
    ↓
Slice 5 (planning closure)             ← depends on all above
```

Slices 1 and 2 can be done in parallel. Slice 3 depends on Slice 1 (so the dead `getCurrentUserRecordSafe` `isTest` branch is already gone). Slice 4 depends on all code changes being done. Slice 5 is bookkeeping.

## Migration Cost Summary

| Change | Files affected | Risk |
|---|---|---|
| Remove `getCurrentUserRecordSafe` | 3 (auth.ts, 2 test files) | Low |
| Extract `withErrorBoundary`/`withRateLimit` | 19 (1 new module + 18 import updates) | Low (mechanical) |
| Unify `isTest` branches | 1-2 (auth.ts + possibly context.ts) | Medium (test behavior changes) |
| Docs | 3-4 | Low |
| Total | ~25 files | Low-Medium |

## Risk Mitigations

1. **Slice 3 test breakage:** The unified test context changes how all wrappers behave in tests. Run the full test suite, not just changed files. If tests break because they expected NO request context (e.g., `getRequestContext()` returning `undefined` in server component tests), fix those tests — that's the whole point.

2. **`createRequestContext` null request:** Verified — `context.ts:86-88` accepts `req: Request | undefined`. Passing `undefined` works and generates a UUID correlation ID. No synthetic request needed.

3. **`serviceDb` import in `auth.ts`:** This creates a new dependency from `api/auth` → `db/service-role`. Verify Biome lint rules allow this import path (it may be restricted to test files). If restricted, the `runWithTestContext` function needs to be gated behind `if (appEnv.isTest)` so the import is dead code in production. Consider a dynamic `import()` or a test-only injection pattern.

4. **Integration tests:** These use real DB via Testcontainers. The unified test context gives them `serviceDb`. Verify this is the same client they already get via `getDb()` in test mode — it should be, but confirm.
