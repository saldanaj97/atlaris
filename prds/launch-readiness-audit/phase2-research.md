# Phase 2: Pre-Launch Hardening — Research & Implementation Plans

> **Parent PRD:** [#284 — Launch Readiness Hardening](https://github.com/saldanaj97/atlaris/issues/284)
> **Prerequisite:** All three slices depend on [#288 — Lifecycle Ownership Consolidation](https://github.com/saldanaj97/atlaris/issues/288)
> **Research date:** 2026-03-19
> **Status:** Research complete — ready for implementation after #288 merges

---

## Slice 5: Status Delivery Cost Reduction (#289)

### 1. Current State

**Polling mechanism:** The `usePlanStatus` hook (`src/hooks/usePlanStatus.ts:162-165`) polls `GET /api/v1/plans/:planId/status` every **3 seconds** with a fixed `setInterval`. No backoff, no jitter. Polling starts when status is `pending` or `processing` and stops on `ready`/`failed` or after 3 consecutive failures.

**Status endpoint cost:** Each poll executes **3 DB queries** against the RLS-enforced connection:

1. `requireOwnedPlanById` — full plan row fetch with RLS check
2. `SELECT id FROM modules WHERE planId = ? LIMIT 1` — module existence check
3. `SELECT classification, createdAt FROM generation_attempts WHERE planId = ? ORDER BY createdAt DESC LIMIT 3` — recent attempts

**Status derivation:** `derivePlanStatus()` in `src/features/plans/status.ts` is a pure function that maps `(generationStatus, hasModules, attemptsCount, attemptCap)` → `PlanStatus`. The DB enum values are `generating | pending_retry | ready | failed`; the client-facing values are `pending | processing | ready | failed`.

**No caching layer:** No HTTP cache headers, no in-memory cache, no read model. Every 3s poll hits the full query path.

**Other status consumers:**

- `useStreamingPlanGeneration` (SSE, not polling) — used during initial generation
- `useRetryGeneration` (SSE, not polling) — used during retry
- `PlanPendingState` component — primary consumer of `usePlanStatus`
- Plan list views — server-rendered snapshot, no polling

### 2. Files to Change

| File                                              | Change                                                                                               | Lines      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------- |
| `src/hooks/usePlanStatus.ts`                      | Replace `setInterval` with `setTimeout`-based exponential backoff + jitter                           | 153-171    |
| `src/hooks/usePlanStatus.ts`                      | Extract polling config constants (initial interval, max interval, backoff multiplier, jitter factor) | New ~10-15 |
| `src/app/api/v1/plans/[planId]/status/route.ts`   | Add lightweight read-model query; reduce to 1-2 DB queries; add `Cache-Control` header               | 25-99      |
| `src/features/plans/status.ts`                    | No change — `derivePlanStatus` is already pure and well-factored                                     | —          |
| `src/lib/db/schema/tables/learning-plans.ts`      | (Optional) Add `moduleCount` or `hasModules` denormalized column                                     | TBD        |
| `src/features/plans/lifecycle/plan-operations.ts` | Update `markPlanGenerationSuccess` to set denormalized status fields if added                        | 175-198    |

**New files:**
| File | Purpose |
|------|---------|
| `src/shared/constants/polling.ts` | Backoff/jitter configuration constants |
| `src/hooks/__tests__/usePlanStatus.test.ts` | Tests for backoff behavior (if not already present) |
| `src/app/api/v1/plans/[planId]/status/__tests__/route.test.ts` | Tests for simplified read model |

### 3. Implementation Steps (TDD)

1. **Write polling backoff tests first:**
   - Test that poll interval increases exponentially from initial (1s) to max (10s)
   - Test that jitter adds ±20% randomization
   - Test that interval resets on successful status change
   - Test that terminal states (`ready`/`failed`) stop polling immediately

2. **Implement backoff/jitter in `usePlanStatus`:**
   - Replace `setInterval(fn, 3000)` with recursive `setTimeout` pattern
   - Constants: `INITIAL_POLL_MS = 1000`, `MAX_POLL_MS = 10000`, `BACKOFF_MULTIPLIER = 1.5`, `JITTER_FACTOR = 0.2`
   - On each poll: `nextDelay = min(currentDelay * BACKOFF_MULTIPLIER, MAX_POLL_MS) * (1 + random(-JITTER_FACTOR, +JITTER_FACTOR))`
   - Reset delay to initial on status transition (e.g., `pending → processing`)

3. **Write status endpoint read-model tests:**
   - Test that status endpoint returns correct status with only 1-2 queries
   - Test `Cache-Control: max-age=1, stale-while-revalidate=2` header is present
   - Test each status state (pending, processing, ready, failed)

4. **Simplify status endpoint:**
   - Option A (preferred): Add denormalized `hasModules` boolean to `learning_plans` table, updated in `markPlanGenerationSuccess`. Eliminates the modules query entirely.
   - Option B (no schema change): Skip modules query when `generationStatus !== 'ready'` (modules only matter for the `ready` + no-modules edge case)
   - Add `Cache-Control: max-age=1, stale-while-revalidate=2` to response

5. **Document the status contract:**
   - Add JSDoc to `derivePlanStatus` explaining the state machine
   - Document the stable response shape in the route file

6. **Validate:**
   - `pnpm test:changed` passes
   - Manual test: create a plan, observe polling interval increases in Network tab

### 4. Risk Areas

- **#288 merge conflict (LOW):** The status endpoint and `usePlanStatus` hook are unlikely to be touched by #288 (lifecycle consolidation). The main overlap is `plan-operations.ts` where `markPlanGenerationSuccess/Failure` live — if #288 moves these into the lifecycle service, the denormalization logic location changes.
- **Denormalized column migration:** Adding `hasModules` to `learning_plans` requires a DB migration. The existing snapshot collision between 0010 and 0011 may need resolution first.
- **Backoff timing in tests:** Using `useFakeTimers` in test environment needs careful handling with React hooks. Consider testing the backoff logic as a pure function, then integration-testing the hook with short intervals.

### 5. Estimated Overlap

- **With #290:** No file overlap
- **With #291:** `plan-operations.ts` is shared (status marking functions used by both DB boundary cleanup and status endpoint). If #291 changes how `markPlanGenerationSuccess` uses DB connections, the denormalized update must go through the same path.

---

## Slice 6: Retry & Idempotency Policy Centralization (#290)

### 1. Current State

**Retry is scattered across three layers with multiplication risk:**

| Layer                | Location                                  | Max attempts            | Backoff               |
| -------------------- | ----------------------------------------- | ----------------------- | --------------------- |
| Provider (p-retry)   | `src/features/ai/providers/router.ts:154` | 2 (1 retry)             | 300-700ms randomized  |
| Per-plan attempt cap | `src/shared/constants/generation.ts:12`   | 3 (env-overridable)     | None (user-initiated) |
| Job queue            | `src/lib/db/queries/jobs.ts:442-514`      | Default 3, hard cap 100 | 2^n sec, max 300s     |

**Critical multiplication risk:** The regeneration worker (`src/features/jobs/regeneration-worker.ts:164`) passes `retryable: true` for retryable failures, which bypasses the default `maxAttempts: 3` and uses `ABSOLUTE_MAX_ATTEMPTS = 100` instead. Combined with provider retry, this means **up to 200 AI calls** per regeneration request (100 job attempts × 2 provider attempts).

**Duplicate detection exists in two layers:**

1. Plan creation: `findRecentDuplicatePlan()` in `plan-operations.ts:260-283` — 60s window, matches userId + lowercase topic + status
2. Job queue: `insertJobRecord()` in `jobs.ts:255-278` — atomically dedupes active jobs for the same planId. Pre-check via `getActiveRegenerationJob()` in regenerate route.

**Idempotent patterns already present:**

- Job completion/failure: `lockJobAndCheckTerminal()` prevents double-processing
- Stripe webhooks: `INSERT ON CONFLICT DO NOTHING` dedup
- RLS cleanup: tracked idempotent flag

**No abandoned request cleanup:**

- No cron for stuck `generating` plans
- No cleanup for orphaned `in_progress` generation attempts
- `cleanupOldJobs()` exists (`jobs.ts:207-224`) but is **never called** by any cron/trigger
- Health check (`api/health/worker/route.ts`) detects stuck jobs but doesn't remediate

**No circuit breaker:** Zero circuit breaker implementations found across the codebase.

### 2. Files to Change

| File                                                | Change                                                                          | Lines           |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | --------------- |
| `src/features/ai/providers/router.ts`               | Move provider-level retry config behind centralized retry policy                | 154-165         |
| `src/features/jobs/regeneration-worker.ts`          | Fix `retryable: true` override to respect bounded retry; use centralized policy | 164, 200-226    |
| `src/lib/db/queries/jobs.ts`                        | Cap `retryable: true` override at `maxAttempts`, not `ABSOLUTE_MAX_ATTEMPTS`    | 98-113, 442-514 |
| `src/shared/constants/generation.ts`                | Add centralized retry policy constants                                          | New section     |
| `src/features/plans/lifecycle/service.ts`           | Integrate retry policy checks (after #288 consolidation)                        | 359-439         |
| `src/app/api/v1/plans/[planId]/retry/route.ts`      | Ensure retry route delegates to lifecycle service retry policy                  | Throughout      |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts` | Ensure regenerate route delegates to lifecycle service                          | Throughout      |

**New files:**
| File | Purpose |
|------|---------|
| `src/features/plans/retry-policy.ts` | Single retry policy module: bounded retry semantics, multiplication guards, backoff config |
| `src/features/plans/retry-policy.test.ts` | Tests for centralized retry policy |
| `src/features/plans/cleanup.ts` | Abandoned request cleanup logic (stuck plans, orphaned attempts) |
| `src/features/plans/cleanup.test.ts` | Tests for cleanup |

### 3. Implementation Steps (TDD)

1. **Write retry policy module tests first:**
   - Test: provider retry × job retry never exceeds defined bound
   - Test: `retryable: true` at job level still respects `maxAttempts` (not 100)
   - Test: total AI calls per regeneration ≤ `maxAttempts * providerRetries` (e.g., 3 × 2 = 6)
   - Test: retry policy returns `{ shouldRetry, delay, reason }` for each classification

2. **Create centralized retry policy module:**

   ```
   src/features/plans/retry-policy.ts
   ```

   - Export `RetryPolicy` with: `MAX_PROVIDER_RETRIES = 1`, `MAX_JOB_RETRIES = 3`, `MAX_TOTAL_AI_CALLS = 6`
   - Export `shouldRetryJob(classification, attemptNumber, maxAttempts)` — single source of truth
   - Export `getRetryDelay(attemptNumber)` — exponential backoff with cap
   - Export `computeEffectiveMaxAttempts(baseMax, retryableOverride)` — replaces the raw `ABSOLUTE_MAX_ATTEMPTS` fallback

3. **Fix the multiplication bug:**
   - In `jobs.ts:computeShouldRetry` (lines 98-113): when `retryable === true`, use `maxAttempts` (default 3) instead of `ABSOLUTE_MAX_ATTEMPTS` (100). Remove or dramatically reduce `ABSOLUTE_MAX_ATTEMPTS`.
   - In `regeneration-worker.ts`: use `shouldRetryJob()` from the policy module instead of passing raw `retryable: true/false`.

4. **Wire retry policy into lifecycle service (post-#288):**
   - After #288 makes lifecycle service the single owner, add retry policy consultation before each generation attempt
   - Lifecycle service checks: "has this plan exhausted retries?" before running generation

5. **Write abandoned request cleanup tests:**
   - Test: plans stuck in `generating` for > 10 minutes are marked `failed`
   - Test: orphaned `in_progress` attempts older than timeout are finalized
   - Test: cleanup does not touch active/healthy generations

6. **Implement cleanup:**
   - `cleanupStuckPlans(thresholdMs)`: marks plans with `generationStatus = 'generating'` and `updatedAt < now - threshold` as `'failed'`
   - `cleanupOrphanedAttempts(thresholdMs)`: finalizes `in_progress` attempts older than threshold
   - Wire `cleanupOldJobs()` (already exists) to a trigger — consider calling it from the health check or a periodic API route

7. **Validate:**
   - `pnpm test:changed` passes
   - Verify: create a regeneration job, confirm max AI calls ≤ 6

### 4. Risk Areas

- **#288 merge conflict (HIGH):** The retry/regeneration routes are primary targets for #288's lifecycle consolidation. The retry route and regenerate route will likely be substantially refactored by #288. Plan to implement this slice **after** #288 merges and rebase.
- **Job queue `ABSOLUTE_MAX_ATTEMPTS` change is behavioral:** Reducing from 100 to 3 changes retry behavior for all jobs. Ensure existing regeneration jobs in the queue aren't mid-retry when the change deploys. Consider a migration strategy or feature flag.
- **Cleanup race condition:** Marking stuck plans as `failed` while they're actually still generating (slow AI response) could cause data loss. Use a generous threshold (≥ 2× the maximum possible generation time, e.g., 15 minutes).
- **No cron infrastructure:** The codebase has no cron/scheduled job system. Cleanup would need to be triggered by the health check endpoint or an external cron (e.g., Vercel cron, GitHub Actions).

### 5. Estimated Overlap

- **With #289:** No file overlap
- **With #291:** Shared files:
  - `src/features/plans/lifecycle/service.ts` — both slices modify the lifecycle service
  - `src/features/jobs/regeneration-worker.ts` — retry policy changes (this slice) and DB boundary changes (#291)
  - `src/lib/db/queries/attempts.ts` — retry logic (this slice) and DB context handling (#291)
  - `src/app/api/v1/plans/[planId]/retry/route.ts` — retry policy (this slice) and DB cleanup (#291)

**Merge recommendation:** Implement #290 (retry policy) **before** #291 (DB boundaries) since retry policy is a logical dependency — knowing the retry bounds informs which DB connections need to stay open.

---

## Slice 7: Request-Time DB Boundary Cleanup (#291)

### 1. Current State

**The stream route opens TWO simultaneous RLS connections:**

```
Connection 1 (request-scoped):
  Created by: withAuth → createAuthenticatedRlsClient()
  Used for: rate limit check, plan creation (quota, dedup, atomic insert)
  Closed: when Response(stream) is returned to Next.js (withAuth finally block)

Connection 2 (stream-scoped):
  Created by: createStreamDbClient() in route.ts:112
  Used for: generation attempts (reserve slot, AI call, finalize, mark success/failure)
  Closed: finally block in SSE stream callback (route.ts:299-301)
```

**Critical bug: Connection 1 is used after it's closed.**
After `withAuth` returns the `Response(stream)`, Connection 1 is cleaned up. But `PlanPersistenceAdapter` still holds a reference to it. When `processGenerationAttempt` calls `markGenerationSuccess/Failure` (via `PlanPersistenceAdapter`), it uses the **already-closed** Connection 1. Similarly, `UsageRecordingAdapter` calls `getDb()` which returns the closed Connection 1 from `AsyncLocalStorage`.

**Why this might not crash today:** The lifecycle service's `processGenerationAttempt` in the stream route is overridden by `deps?.overrides?.processGenerationAttempt` or called via `lifecycleService.processGenerationAttempt.bind(lifecycleService)`. The actual generation runs through `GenerationAdapter` which uses Connection 2. The lifecycle service's own `markGenerationSuccess/Failure` calls go through the adapter which uses Connection 1 — but #288 may change this plumbing.

**Connection lifecycle timeline:**
| Time | Event | Connection 1 | Connection 2 |
|------|-------|-------------|-------------|
| T0 | Request arrives | OPEN (withAuth) | — |
| T1 | Rate limit + plan creation | ACTIVE | — |
| T2 | Stream DB client created | OPEN | OPEN |
| T3 | Response returned | **CLOSED** | OPEN |
| T4 | AI generation (30-120s) | CLOSED | OPEN (idle) |
| T5 | Mark success + record usage | CLOSED (⚠️ used!) | OPEN |
| T6 | Stream completes | CLOSED | **CLOSED** |

**Each RLS connection costs 3 round trips:** `SET ROLE` + `SET search_path` + `set_config` ≈ 15-30ms.

**Factory wiring splits DB clients:**

- `PlanPersistenceAdapter`, `QuotaAdapter`, `PdfOriginAdapter` → Connection 1 (`dbClient`)
- `GenerationAdapter` → Connection 2 (`attemptsDbClient`)
- `UsageRecordingAdapter` → **no injected client** (uses `getDb()` fallback → Connection 1)

**Worker/background scope:** Uses `serviceRoleDb` directly from `src/lib/db/service-role.ts` — singleton, `max: 10` pool, never closed. Appropriate for background jobs.

### 2. Files to Change

| File                                                                | Change                                                                                              | Lines                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| `src/app/api/v1/plans/stream/route.ts`                              | Eliminate dual-connection pattern; use single stream-scoped connection for all lifecycle operations | 94, 111-131, 299-301, 319-336 |
| `src/features/plans/lifecycle/factory.ts`                           | Remove `dbClient`/`attemptsDbClient` split; accept single `dbClient`                                | 20-33                         |
| `src/features/plans/lifecycle/adapters/usage-recording-adapter.ts`  | Accept injected `dbClient` instead of relying on `getDb()`                                          | 15-46                         |
| `src/features/plans/lifecycle/adapters/plan-persistence-adapter.ts` | Ensure it uses the stream-scoped connection (same one as generation)                                | 20-63                         |
| `src/features/plans/lifecycle/adapters/generation-adapter.ts`       | Align with single-connection pattern                                                                | 25-113                        |
| `src/lib/db/rls.ts`                                                 | (Optional) Consider longer `idle_timeout` for stream clients                                        | 86-88                         |
| `src/app/api/v1/plans/[planId]/retry/route.ts`                      | Apply same single-connection pattern if it has similar dual-connection setup                        | Throughout                    |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts`                 | Verify worker uses `serviceRoleDb` correctly (no RLS needed)                                        | Throughout                    |

### 3. Implementation Steps (TDD)

1. **Write DB boundary tests first:**
   - Test: stream route opens exactly 1 RLS connection (not 2)
   - Test: all lifecycle operations during generation use the same DB connection
   - Test: DB connection is open for the entire duration of the stream, closed only in finally
   - Test: `UsageRecordingAdapter` uses injected client, not `getDb()` fallback
   - Test: worker/regeneration uses `serviceRoleDb` (no RLS client created)

2. **Unify the factory to accept a single DB client:**
   - Remove the `dbClient` / `attemptsDbClient` split in `factory.ts`
   - All adapters receive the same `dbClient`
   - `UsageRecordingAdapter` constructor accepts `dbClient` parameter

3. **Restructure stream route connection lifecycle:**

   ```
   Current:
     withAuth creates Connection 1 → plan creation
     createStreamDbClient creates Connection 2 → generation
     Connection 1 dies when Response returned; Connection 2 survives

   Target:
     withAuth creates Connection 1 → rate limit check ONLY
     createStreamDbClient creates Connection 2 → ALL lifecycle operations
     Connection 1 dies safely (only used for rate limit)
     Connection 2 used for: plan creation + generation + usage recording
   ```

   - Move `getDb()` usage for rate limit check to be explicit (this is the only thing that needs the request-scoped connection)
   - Create lifecycle service with `dbClient: streamDb` for **all** adapters
   - Or better: defer rate limit check to also use `streamDb`

4. **Fix `UsageRecordingAdapter` dependency:**
   - Add `dbClient` to constructor
   - Pass it through to `recordUsage()` and `incrementUsage()`
   - Remove `getDb()` fallback from the adapter (fail-closed if no client injected)

5. **Document remaining multi-context paths:**
   - The `withAuth` layer will still create an RLS connection for auth — this is unavoidable and correct
   - The stream-scoped RLS connection is the "real" DB context for all plan lifecycle operations
   - Workers use `serviceRoleDb` — no RLS, no multi-context
   - Add JSDoc comments to `factory.ts` explaining the single-client design

6. **Consider idle_timeout for stream connections:**
   - Current: `idle_timeout: 20` seconds
   - During AI generation (30-120s), the connection is idle
   - Increase to `idle_timeout: 180` (3 minutes) for stream-scoped connections to avoid premature closure
   - Already noted in repository memory: "Streaming RLS clients need idle_timeout > max generation duration"

7. **Validate:**
   - `pnpm test:changed` passes
   - Manual test: generate a plan, verify only 1 RLS connection is created (check logs for `SET ROLE` calls)
   - Verify usage recording works correctly during generation (no stale-connection errors)

### 4. Risk Areas

- **#288 merge conflict (HIGH):** The factory wiring (`factory.ts`) and the stream route's DB client creation are primary #288 targets. #288 may already consolidate the dual-connection pattern. **Wait for #288 to merge before starting.**
- **Connection 1 still needed for auth:** The `withAuth` middleware creates an RLS connection for authentication. We can't eliminate it entirely — but we can ensure it's only used for the auth check and rate limiting, not for downstream lifecycle operations.
- **Rate limit check depends on `getDb()`:** `checkPlanGenerationRateLimit` (`src/lib/api/rate-limit.ts`) uses `getDb()` which returns the request-scoped connection. If we stop using `getDb()` for lifecycle operations, this still needs to work. The rate limit check runs **before** the stream DB client is created, so it naturally uses Connection 1.
- **Test environment difference:** In tests, `createStreamDbClient` returns `getDb()` (service-role) with a noop cleanup. This means the dual-connection bug is invisible in tests. Need to add a test that explicitly verifies connection count.
- **`idle_timeout` vs Neon pooler:** If using Neon's connection pooler for the stream client, `idle_timeout` may interact poorly with pooler-level timeouts. The RLS client already uses non-pooling connections, so this should be safe.

### 5. Estimated Overlap

- **With #289:** `plan-operations.ts` shared if status denormalization is added to `markPlanGenerationSuccess`
- **With #290:** Shared files:
  - `src/features/plans/lifecycle/service.ts` — both slices modify the lifecycle service
  - `src/features/plans/lifecycle/factory.ts` — DB client wiring (this slice) and retry policy integration (#290)
  - `src/features/jobs/regeneration-worker.ts` — DB context (this slice) and retry policy (#290)
  - `src/lib/db/queries/attempts.ts` — DB context cleanup (this slice) and retry logic (#290)

**Merge recommendation:** Implement #290 (retry policy) **first**, then #291 (DB boundaries). Retry policy is a pure logic change; DB boundaries are a plumbing change that's easier to do once retry logic is settled.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```
#288 merges (prerequisite)
  │
  ├── #289 Status Delivery Cost Reduction    ← Start immediately (low overlap)
  │
  ├── #290 Retry & Idempotency Policy        ← Start immediately (parallel with #289)
  │     │
  │     └── #291 DB Boundary Cleanup          ← Start after #290 (shared files)
```

**Rationale:**

- #289 has minimal overlap with the other two slices — can proceed fully in parallel
- #290 (retry policy) is a logical dependency for #291 (DB boundaries) — knowing retry bounds informs connection lifecycle
- #291 touches the same lifecycle/factory/worker files as #290 — implementing it second reduces merge conflicts

### Shared File Map

| File                                                | #289                 | #290       | #291          |
| --------------------------------------------------- | -------------------- | ---------- | ------------- |
| `src/hooks/usePlanStatus.ts`                        | ✅ primary           | —          | —             |
| `src/app/api/v1/plans/[planId]/status/route.ts`     | ✅ primary           | —          | —             |
| `src/features/plans/lifecycle/service.ts`           | —                    | ✅         | ✅            |
| `src/features/plans/lifecycle/factory.ts`           | —                    | —          | ✅ primary    |
| `src/features/plans/lifecycle/adapters/*`           | —                    | —          | ✅ primary    |
| `src/features/plans/lifecycle/plan-operations.ts`   | ✅ (if denormalized) | —          | ✅            |
| `src/features/ai/providers/router.ts`               | —                    | ✅         | —             |
| `src/features/jobs/regeneration-worker.ts`          | —                    | ✅         | ✅            |
| `src/lib/db/queries/jobs.ts`                        | —                    | ✅ primary | —             |
| `src/lib/db/queries/attempts.ts`                    | —                    | ✅         | ✅            |
| `src/app/api/v1/plans/stream/route.ts`              | —                    | —          | ✅ primary    |
| `src/app/api/v1/plans/[planId]/retry/route.ts`      | —                    | ✅         | ✅            |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts` | —                    | ✅         | ✅            |
| `src/shared/constants/generation.ts`                | —                    | ✅         | —             |
| `src/lib/db/rls.ts`                                 | —                    | —          | ✅ (optional) |
