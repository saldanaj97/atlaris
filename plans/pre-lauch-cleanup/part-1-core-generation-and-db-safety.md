# Part 1: Core Generation and DB Safety Review

Date: 2026-02-10  
Scope: core plan-generation request paths, DB client safety, RLS correctness, entrypoint duplication, and status/source-of-truth drift.

## Findings (Prioritized)

### 1) `getDb()` is fail-open to service-role in production request paths

**Priority:** Critical

**Why this matters**

- A missing/broken request context currently falls back to service-role DB, which bypasses RLS and silently weakens tenant isolation.
- This is exactly the kind of bug that turns a small handler mistake into a cross-tenant data exposure risk.

**Evidence**

- `src/lib/db/runtime.ts:15`
- `src/lib/db/runtime.ts:25`
- `src/lib/api/auth.ts:138`

**Recommended change**

- Make `getDb()` fail-closed in non-test request code:
  - If `appEnv.isTest`: keep current test behavior.
  - Else if request context exists and has `db`: return it.
  - Else: throw a typed error (`MissingRequestDbContextError`) instead of falling back.
- For workers/background jobs, require explicit import of `db` from `@/lib/db/service-role` (no implicit fallback path).
- Add a narrow `getServiceDbForWorker()` helper only if absolutely needed outside worker modules, and name it loudly.

**Suggested verification tests**

- Unit: `getDb()` throws when no request context in non-test runtime.
- Unit: `getDb()` returns context DB when context is set.
- API integration: a wrapped route still works and uses request-scoped DB.

---

### 2) Retry path has a race window that can start duplicate costly generations

**Priority:** Critical

**Why this matters**

- `retry` does check-then-update in separate statements, so concurrent requests can both pass and both start generation.
- Result: duplicate provider calls, unexpected cost, and status churn.

**Evidence**

- `src/app/api/v1/plans/[planId]/retry/route.ts:73`
- `src/app/api/v1/plans/[planId]/retry/route.ts:89`
- `src/lib/db/queries/attempts.ts:284`

**Recommended change**

- Introduce one atomic gate in DB layer (single transaction) for retry start:
  - Lock target plan row (`FOR UPDATE`) by `planId` and ownership.
  - Validate `generationStatus === 'failed'` and attempt cap in the same tx.
  - Transition to `generating` in that same tx (or reject).
- Route should call this gate and stop doing separate count/update logic.
- Keep orchestrator cap enforcement as a backstop, but make route-level gate authoritative.

**Suggested verification tests**

- Integration: fire two concurrent retry requests, assert only one reaches provider call.
- Integration: when cap reached, both concurrent retries return rejection and no new generation starts.

---

### 3) Plan status has split sources of truth and contradictory mapping

**Priority:** High

**Why this matters**

- Different endpoints derive status from different signals (`generation_status`, modules, attempts, legacy `job_queue`).
- This causes UI drift: same plan can appear as `processing` in one place and `pending`/`failed` in another.

**Evidence**

- `src/app/api/v1/plans/[planId]/status/route.ts:81`
- `src/lib/mappers/detailToClient.ts:113`
- `src/lib/mappers/detailToClient.ts:120`
- `src/lib/db/queries/plans.ts:175`

**Recommended change**

- Make `learning_plans.generationStatus` the primary status source.
- Remove `jobQueue` inputs from detail query + mapper for manual/streamed generation state.
- Update `derivePlanStatus` to use:
  1. `generationStatus === 'ready'` OR modules exist -> `ready`
  2. `generationStatus === 'failed'` -> `failed`
  3. `generationStatus === 'generating'` -> `processing`
  4. fallback -> `pending`

**Suggested verification tests**

- Unit: mapper status table tests for each `generationStatus` + module presence combination.
- API: `/status` and plan detail endpoint return consistent status for same fixture.

---

### 4) Redundant generation entrypoint (`src/app/plans/actions.ts`) is dead and drift-prone

**Priority:** High

**Why this matters**

- The server action duplicates creation/generation orchestration and can drift from API safeguards (rate limits, model gating, stream behavior).
- It appears unused, so it is pure maintenance risk.

**Evidence**

- `src/app/plans/actions.ts:32`
- `src/app/plans/actions.ts:70`
- `src/app/plans/actions.ts:84`
- `src/app/plans/actions.ts` has no call sites (`generateLearningPlan(` search in `src/` only matches definition).

**Recommended change**

- Remove `generateLearningPlan` server action if no intended consumer.
- If needed for future UX, convert to thin wrapper that calls the same API path (or shared service) used by `/api/v1/plans/stream`.

**Suggested verification tests**

- Build/type-check to confirm no references remain.
- E2E smoke on onboarding flow to verify no hidden dependency on this action.

---

### 5) Durable generation limiter is not enforced on retry path

**Priority:** High

**Why this matters**

- `retry` uses in-memory category limiter only; durable DB-backed limiter (`generation_attempts` window) is not applied.
- This weakens abuse resistance under multi-instance deployments and restart scenarios.

**Evidence**

- `src/lib/api/rate-limit.ts:21`
- `src/app/api/v1/plans/stream/route.ts:62`
- `src/app/api/v1/plans/[planId]/retry/route.ts:31` (no durable limiter call)

**Recommended change**

- Call `checkPlanGenerationRateLimit(db)` in retry before starting generation.
- Better: enforce durable limiter inside shared generation preflight used by both stream and retry to avoid endpoint drift.

**Suggested verification tests**

- Integration: after 10 attempts in window, retry endpoint returns 429 with `retryAfter`.
- Unit: shared preflight applied in both stream and retry handlers.

---

### 6) DB client usage is implicit and repeated within handlers, hurting readability and safety auditing

**Priority:** Medium

**Why this matters**

- Multiple `getDb()` calls in one handler make it harder to reason about which client is used where.
- It also makes future audits harder when context handling changes.

**Evidence**

- `src/app/api/v1/plans/stream/route.ts:62`
- `src/app/api/v1/plans/stream/route.ts:64`
- `src/app/api/v1/plans/stream/route.ts:183`
- `src/app/api/v1/plans/[planId]/retry/route.ts:49`
- `src/app/api/v1/plans/[planId]/retry/route.ts:137`

**Recommended change**

- Resolve DB once at top (`const db = getDb()`) and pass explicitly through helper/orchestrator calls.
- For stream helpers (`handleSuccessfulGeneration`, `handleFailedGeneration`, `safeMarkPlanFailed`), accept `dbClient` param to avoid internal hidden `getDb()`.

**Suggested verification tests**

- Unit: stream helper functions accept and use injected DB client.
- API integration: stream + retry still succeed with explicit `db` wiring.

---

### 7) Detail query does extra work tied to legacy queue state

**Priority:** Medium

**Why this matters**

- Querying `job_queue` for plan detail adds overhead and cognitive load while no longer being authoritative for generation status.
- This is avoidable query work on a common read path.

**Evidence**

- `src/lib/db/queries/plans.ts:175`
- `src/lib/db/queries/plans.ts:210`
- `src/lib/types/db.ts:97`
- `src/lib/mappers/planQueries.ts:98`

**Recommended change**

- Remove `latestJobStatus`/`latestJobError` from detail query output and mapping types.
- Keep attempt metadata + `learningPlans.generationStatus` only.

**Suggested verification tests**

- Unit: `mapLearningPlanDetail` shape after removing queue fields.
- API integration: plan detail response remains backward-compatible (or explicitly versioned).

---

### 8) Retry route duplicates business checks already represented in orchestrator flow

**Priority:** Low

**Why this matters**

- Attempt-cap logic exists in both retry route and attempts/orchestrator path.
- Duplicate logic increases drift risk and makes behavior under edge cases less predictable.

**Evidence**

- `src/app/api/v1/plans/[planId]/retry/route.ts:73`
- `src/lib/ai/orchestrator.ts:144`
- `src/lib/db/queries/attempts.ts:289`

**Recommended change**

- Consolidate preflight checks into one shared gate used by stream+retry.
- Keep route checks only for fast input/ownership validation; move generation policy checks to shared layer.

**Suggested verification tests**

- Unit: shared gate returns deterministic outcomes for capped/not-capped.
- Integration: retry behavior unchanged for normal path, simplified for edge cases.

---

## Quick Wins This Week

1. Make `getDb()` fail-closed in non-test request paths (`runtime.ts`).
2. Add durable limiter call to retry route (`checkPlanGenerationRateLimit`).
3. Remove dead `generateLearningPlan` server action (or mark deprecated and block usage).
4. Standardize status derivation to `learning_plans.generation_status` + module presence.
5. Pass a single `db` instance through stream/retry handlers and stream helpers.

## Structural Refactors (Post-Launch)

1. Introduce a single `prepareGenerationRequest()` service for stream+retry with atomic retry gate + durable limiter + model/tier enforcement.
2. Remove legacy `job_queue` coupling from read models (`LearningPlanDetail`, mappers, queries).
3. Move generation status mapping to one shared utility used by `/status`, detail mapper, and any server actions.
4. Add concurrency-focused tests around retry and attempt-cap enforcement (real DB transaction behavior).
5. Add a lightweight architecture test that forbids request-path fallback to service-role DB.
