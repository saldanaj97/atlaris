# Phase 3: Post-Launch Cleanup — Research & Implementation Plans

> **Parent PRD:** [#284 — Launch Readiness Hardening](https://github.com/saldanaj97/atlaris/issues/284)
> **Prerequisite:** All Phase 1 and Phase 2 slices merged ✅
> **Research date:** 2026-03-19
> **Status:** Research complete — both slices are unblocked and ready for implementation

---

## Slice 9: Read-Path Optimization & Subscription Caching (#293)

### 1. Current State

**Plan-list endpoint (`GET /api/v1/plans`):** `src/app/api/v1/plans/route.ts:23-28` calls `getPlanSummariesForUser(user.id, db)` with **no pagination parameters**. Every request fetches the user's entire plan history.

**Query function:** `src/lib/db/queries/plans.ts:64-130` (`getPlanSummariesForUser`) already accepts optional `{ limit, offset }` but the route never passes them. Each call executes **4 database queries**:

1. `SELECT * FROM learning_plans WHERE userId = ? ORDER BY createdAt DESC` — all plan rows, all columns (line 74-90)
2. `SELECT * FROM modules WHERE planId IN (...)` — all modules for all plans (line 98-103)
3. `SELECT id, moduleId, planId, estimatedMinutes FROM tasks INNER JOIN modules ...` — all tasks for all plans (line 104-113)
4. `fetchTaskProgressRows({ taskIds, userId })` — progress records for all tasks (line 118-122)

**Response shape:** `PlanSummary` in `src/shared/types/db.types.ts:40-49` returns the **full `LearningPlan` object** (including `extractedContext` JSONB which can be large for PDF plans) plus full `Module[]` array plus computed completion metrics.

**Subscription status endpoint (`GET /api/v1/user/subscription`):** `src/app/api/v1/user/subscription/route.ts:55-86` reads subscription tier/status/periodEnd from the local DB (webhook-synced), but makes a **live Stripe API call** on every request to fetch `cancel_at_period_end` via `getCancelAtPeriodEnd()` (lines 16-49). This calls `stripe.subscriptions.retrieve(stripeSubscriptionId)`.

**Webhook sync:** `src/features/billing/subscriptions.ts:93-213` (`syncSubscriptionToDb`) updates `users.subscriptionTier`, `subscriptionStatus`, `subscriptionPeriodEnd`, and `stripeSubscriptionId` on webhook events. However, `cancel_at_period_end` is **not synced** — no column exists in the users table for it.

**Webhook events handled:** `src/app/api/v1/stripe/webhook/route.ts:179-295`:

- `customer.subscription.created` / `updated` → `syncSubscriptionToDb()`
- `customer.subscription.deleted` → downgrade to 'free'
- `invoice.payment_failed` → set status to 'past_due'

**Pricing page:** `src/app/pricing/components/stripe-pricing.ts:1-182` (`fetchStripeTierData`) calls `stripe.prices.retrieve()` and `stripe.products.retrieve()` on every request — no caching. This is a separate concern from the subscription endpoint but worth noting.

### 2. Files to Change

| File                                        | Change                                                                                                                                               | Lines        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `src/app/api/v1/plans/route.ts`             | Add query param parsing for `limit`/`offset`, pass to `getPlanSummariesForUser`, add `X-Total-Count` header                                          | 23-28        |
| `src/lib/db/queries/plans.ts`               | Add `getPlanSummaryCount()` for total count; create `getLightweightPlanSummaries()` that selects only list-view columns and skips `extractedContext` | 64-130       |
| `src/shared/types/db.types.ts`              | Add `LightweightPlanSummary` type (subset of `PlanSummary` without full plan object)                                                                 | 40-49        |
| `src/lib/db/queries/mappers.ts`             | Add `mapLightweightPlanSummaries()` that produces compact summaries                                                                                  | New mapper   |
| `src/app/api/v1/user/subscription/route.ts` | Remove live Stripe `getCancelAtPeriodEnd()` call; read `cancelAtPeriodEnd` from DB                                                                   | 16-49, 62-75 |
| `src/lib/db/schema/tables/users.ts`         | Add `cancelAtPeriodEnd: boolean` column (default `false`)                                                                                            | 36           |
| `src/features/billing/subscriptions.ts`     | Sync `cancel_at_period_end` from Stripe subscription in `syncSubscriptionToDb()`                                                                     | 203-212      |
| `src/app/api/v1/stripe/webhook/route.ts`    | Ensure `customer.subscription.updated` events sync `cancel_at_period_end` (already calls `syncSubscriptionToDb`, just need the field)                | 185-210      |

**New files:**

| File                                                      | Purpose                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/db/migrations/XXXX_add_cancel_at_period_end.sql` | Migration to add `cancel_at_period_end` column to `users` table |
| `tests/integration/api/plan-list-pagination.spec.ts`      | Tests for pagination defaults, lightweight summaries            |
| `tests/integration/api/subscription-caching.spec.ts`      | Tests for cached subscription status (no live Stripe call)      |
| `src/shared/constants/pagination.ts`                      | Pagination default constants                                    |

### 3. Implementation Steps (TDD)

**Part A: Plan-List Pagination & Lightweight Summaries**

1. **Write pagination tests first:**
   - Test: `GET /api/v1/plans` returns max `DEFAULT_PAGE_SIZE` (20) results when no params
   - Test: `GET /api/v1/plans?limit=5&offset=10` returns 5 results starting at offset 10
   - Test: `GET /api/v1/plans?limit=200` is clamped to `MAX_PAGE_SIZE` (100)
   - Test: Response includes `X-Total-Count` header with total plan count
   - Test: `limit=0` or negative values are rejected with 400

2. **Create pagination constants:**
   - `src/shared/constants/pagination.ts`: `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`

3. **Add lightweight summary query:**
   - Create `getLightweightPlanSummaries(userId, dbClient, options)` in `src/lib/db/queries/plans.ts`
   - Select only: `id`, `topic`, `skillLevel`, `learningStyle`, `visibility`, `origin`, `generationStatus`, `createdAt`, `updatedAt`
   - Exclude `extractedContext` (large JSONB for PDF plans)
   - Still fetch modules and compute completion metrics but use lightweight task query (count + sum only, not full rows)
   - Add `getPlanSummaryCount(userId, dbClient)` for total count

4. **Write lightweight summary tests:**
   - Test: Lightweight summary does NOT include `extractedContext`
   - Test: Completion metrics are accurate (match full summary calculation)
   - Test: Response shape matches `LightweightPlanSummary` type

5. **Update route handler:**
   - Parse `limit` and `offset` from URL search params
   - Clamp to `[1, MAX_PAGE_SIZE]` for limit, `[0, ∞)` for offset
   - Call `getLightweightPlanSummaries()` with pagination
   - Add `X-Total-Count` header from `getPlanSummaryCount()`

6. **Validate:**
   - `pnpm lint && pnpm type-check && pnpm test:changed`

**Part B: Subscription Caching**

7. **Write subscription caching tests first:**
   - Test: `GET /api/v1/user/subscription` returns `cancelAtPeriodEnd` from DB (no Stripe call)
   - Test: Webhook `customer.subscription.updated` syncs `cancel_at_period_end` to DB
   - Test: User with no subscription returns `cancelAtPeriodEnd: false`
   - Test: Fallback behavior when `cancel_at_period_end` column is null

8. **Add DB column and migration:**
   - Add `cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false)` to users table
   - Generate migration: `pnpm db:generate`

9. **Update webhook sync:**
   - In `syncSubscriptionToDb()`, add `cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false` to the update set
   - The subscription object from Stripe already has this field

10. **Remove live Stripe call from subscription endpoint:**
    - Delete `getCancelAtPeriodEnd()` function entirely
    - Read `user.cancelAtPeriodEnd` from the authenticated user object (already available from `withAuth`)
    - Response shape stays identical: `{ tier, status, periodEnd, cancelAtPeriodEnd, usage }`

11. **Validate:**
    - `pnpm lint && pnpm type-check && pnpm test:changed`
    - Verify existing Stripe integration tests still pass

### 4. Risk Areas

- **Migration required:** Adding `cancel_at_period_end` to users table requires a DB migration. Default `false` is safe for existing rows. Existing subscriptions won't have the correct value until the next webhook event fires — consider a one-time backfill script or accept stale data until next subscription update.
- **Lightweight summary backward compatibility:** Frontend components consuming `PlanSummary` may depend on the full `LearningPlan` object or `modules` array. Need to verify which client components consume the plan-list response and update them if the shape changes. Consider keeping the old endpoint working and introducing the new shape on a new query param (e.g., `?format=summary`) or versioned endpoint.
- **Pagination changes client behavior:** Frontend plan list currently renders all plans at once. Adding server-side pagination requires corresponding frontend changes (infinite scroll or paginated list). If frontend changes are deferred, the default `limit=20` may surprise users with >20 plans.
- **`X-Total-Count` performance:** A separate count query on `learning_plans` is cheap with the existing `idx_learning_plans_user_id` index.

### 5. Estimated Overlap

- **With #294:** No direct file overlap. Slice 10 focuses on generation/attempt persistence and job queue; Slice 9 focuses on read paths and billing. Both touch `src/lib/db/schema/tables/` but different tables (plans.ts vs users.ts).
- **Merge recommendation:** Either can land first — no dependency between them.

---

## Slice 10: Persistence Simplification & Queue Consolidation (#294)

### 1. Current State

**Two overlapping generation metadata tables:**

1. **`planGenerations`** (`src/lib/db/schema/tables/plans.ts:179-237`): Stores request-level metadata — `model`, `prompt` (jsonb), `parameters` (jsonb), `outputSummary` (jsonb). Has full RLS policies. **Not imported or queried outside schema/relations files** — effectively dead/unused in application code.

2. **`generationAttempts`** (`src/lib/db/schema/tables/plans.ts:239-309`): The actively used table — stores per-attempt outcome (`status`, `classification`, `durationMs`, `modulesCount`, `tasksCount`), plus `metadata` (jsonb) and `promptHash`. Immutable audit log (DELETE denied by RLS policy at line 301-306).

**Redundancy:** `planGenerations` captures request metadata that overlaps with `generationAttempts.metadata`. The `planGenerations` table is **never queried by application code** — only defined in schema and relations. It's a dead table.

**Scattered state mutations:** Three modules can update `learning_plans.generationStatus`:

| Module          | File                                                          | Operations                                                                |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Plan Operations | `src/features/plans/lifecycle/plan-operations.ts:162,185,211` | INSERT (generating), UPDATE (ready), UPDATE (failed)                      |
| Attempts        | `src/lib/db/queries/attempts.ts:206-211,378-392`              | UPDATE (generating on reserve), UPDATE (failed/pending_retry on finalize) |
| Cleanup         | `src/features/plans/cleanup.ts:25`                            | UPDATE (failed for stuck plans)                                           |

Additionally, `src/lib/db/queries/helpers/attempts-persistence.ts:227-236` (`persistSuccessfulAttempt`) also updates `learning_plans` to `ready` — a **duplicate** of `markPlanGenerationSuccess` in plan-operations.

**Background job infrastructure:**

- **Job queue table:** `src/lib/db/schema/tables/jobs.ts:22-88` — `jobQueue` with status enum (`pending`, `processing`, `completed`, `failed`), retry support, distributed locking
- **Job types:** `plan_generation` and `plan_regeneration` defined in `src/shared/constants/jobs.ts:6-16`
- **Active worker:** Only `plan_regeneration` has a worker (`src/features/jobs/regeneration-worker.ts`)
- **`plan_generation` type defined but never used** — initial generation runs synchronously in the stream route, not via queue
- **Thin queue wrapper:** `src/features/jobs/queue.ts` (82 lines) — 5 of 6 functions are one-liner delegates to `src/lib/db/queries/jobs.ts`. Justified (centralizes service-role DB binding) but documented as a known pattern in `prds/cleanup-inversions-and-dead-code/todos.md:167-182`

**Retry policy (already centralized in Phase 2):** `src/features/plans/retry-policy.ts` and `src/shared/constants/retry-policy.ts` own bounded retry semantics. The multiplication bug (100× ABSOLUTE_MAX_ATTEMPTS) was fixed in Phase 2 (#290).

**Technical debt TODOs in codebase:**

- `src/lib/db/schema/tables/tasks.ts:179-181` — TODO: add DB-level title length constraint and updatedAt
- `src/lib/db/schema/tables/usage.ts:80-82` — TODO: add OpenRouter cost tracking fields
- `src/lib/db/enums.ts:26` — TODO: rename `youtube` back to `video`
- `src/lib/db/queries/attempts.ts:78-92` — Workaround: re-applies RLS JWT claims inside transactions to avoid drift

### 2. Files to Change

| File                                                 | Change                                                                                                               | Lines            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `src/lib/db/schema/tables/plans.ts`                  | Mark `planGenerations` table as deprecated with JSDoc; plan for removal migration                                    | 179-237          |
| `src/lib/db/schema/relations.ts`                     | Update relations to reflect `planGenerations` deprecation                                                            | 45, 59-63        |
| `src/lib/db/queries/attempts.ts`                     | Consolidate plan-state updates: remove direct `learning_plans.generationStatus` updates, delegate to plan-operations | 206-211, 378-392 |
| `src/lib/db/queries/helpers/attempts-persistence.ts` | Remove duplicate `learning_plans` update in `persistSuccessfulAttempt` — call `markPlanGenerationSuccess` instead    | 227-236          |
| `src/features/plans/lifecycle/plan-operations.ts`    | Ensure this is the **sole owner** of all `learning_plans.generationStatus` mutations                                 | Throughout       |
| `src/features/plans/cleanup.ts`                      | Route cleanup state mutations through plan-operations instead of direct SQL                                          | 22-34            |
| `src/shared/constants/jobs.ts`                       | Remove or document `PLAN_GENERATION` job type as unused                                                              | 7                |
| `src/features/jobs/queue.ts`                         | Add JSDoc explaining the thin-wrapper justification                                                                  | Throughout       |

**New files:**

| File                                                        | Purpose                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/technical-debt.md`                                    | Explicit documentation of deferred technical debt with rationale   |
| `src/lib/db/migrations/XXXX_deprecate_plan_generations.sql` | Migration to drop `plan_generations` table (or mark as deprecated) |

### 3. Implementation Steps (TDD)

**Part A: Consolidate State Mutations**

1. **Write state mutation ownership tests first:**
   - Test: All plan state transitions go through `plan-operations.ts` functions
   - Test: `persistSuccessfulAttempt` delegates to `markPlanGenerationSuccess` (not direct SQL)
   - Test: `finalizeAttemptFailure` delegates to plan-operations for status update
   - Test: Cleanup module delegates to plan-operations for stuck-plan recovery

2. **Refactor `persistSuccessfulAttempt`:**
   - Remove the direct `learning_plans` UPDATE at `attempts-persistence.ts:227-236`
   - Instead, have the caller (lifecycle service) call `markPlanGenerationSuccess` after `persistSuccessfulAttempt` succeeds
   - Verify the lifecycle service already does this (check `service.ts:385`) — if so, the duplicate in `persistSuccessfulAttempt` can simply be removed

3. **Refactor `finalizeAttemptFailure`:**
   - Extract the `learning_plans` status update (lines 377-392) into a call to plan-operations
   - `finalizeAttemptFailure` should only update the `generationAttempts` row
   - Plan status update should happen in the caller (lifecycle service) based on the failure result
   - This may require returning `{ isTerminal, classification }` from `finalizeAttemptFailure` so the caller can decide

4. **Refactor cleanup module:**
   - `cleanupStuckPlans` at `cleanup.ts:22-34` directly updates `learning_plans.generationStatus`
   - Change to call `markPlanGenerationFailure` from plan-operations instead
   - `cleanupOrphanedAttempts` at `cleanup.ts:58-73` updates `generationAttempts.status` — this is fine (attempt-level, not plan-level)

5. **Validate state consolidation:**
   - `grep -rn "generationStatus" src/ --include="*.ts"` — verify only plan-operations writes to it
   - `pnpm lint && pnpm type-check && pnpm test:changed`

**Part B: Remove Dead `planGenerations` Table**

6. **Verify `planGenerations` is truly unused:**
   - Confirm no application code queries or inserts into `planGenerations` (research confirms this)
   - Check for any migration dependencies on the table

7. **Write deprecation migration:**
   - Generate a Drizzle migration that drops the `plan_generations` table
   - Remove the table definition from `src/lib/db/schema/tables/plans.ts`
   - Remove the relations from `src/lib/db/schema/relations.ts`
   - Remove the `PlanGeneration` type export from `src/shared/types/db.types.ts`

8. **Validate:**
   - `pnpm lint && pnpm type-check && pnpm test:changed`

**Part C: Document Technical Debt**

9. **Create `docs/technical-debt.md`:**
   - Document all deferred debt items with rationale:
     - `plan_generation` job type: defined but unused; initial generation runs synchronously
     - Job queue thin wrapper: justified for service-role binding centralization
     - RLS claim re-application workaround in transactions
     - Missing DB-level constraints on task titles
     - OpenRouter cost tracking fields not yet added
     - Enum naming (`youtube` vs `video`)
   - For each item: describe the issue, why it's deferred, and conditions under which it should be addressed

10. **Add JSDoc to `queue.ts`:**
    - Document the thin-wrapper pattern and why it exists
    - Document that `PLAN_GENERATION` job type is reserved but not implemented

11. **Validate:**
    - `pnpm lint && pnpm type-check && pnpm test:changed`

### 4. Risk Areas

- **`persistSuccessfulAttempt` dual-write removal:** Currently both `persistSuccessfulAttempt` (attempts-persistence.ts:227-236) and the lifecycle service (via `markPlanGenerationSuccess`) update `learning_plans` to `ready`. Removing the persistence helper's update requires confirming the lifecycle service **always** calls `markPlanGenerationSuccess` after success. If any code path calls `persistSuccessfulAttempt` without the lifecycle service, plan status won't be updated. Trace all callers carefully.
- **`finalizeAttemptFailure` refactor complexity:** Currently this function atomically updates both `generationAttempts` and `learning_plans` in the same transaction. Splitting them means the caller must handle the plan update separately — potential for partial failure (attempt marked failed, plan left in `generating`). The cleanup module would catch this, but it adds a window of inconsistency.
- **Migration for dropping `planGenerations`:** Historical migrations reference this table. Drizzle's migration history may need careful handling. Consider a "soft deprecation" (mark deprecated, stop using) before a hard drop in a later release.
- **Behavioral regressions in generation flow:** These are deep changes to the generation state machine. Run the full test suite, not just changed tests, to catch regressions.

### 5. Estimated Overlap

- **With #293:** No direct file overlap — Slice 9 touches read paths and billing; Slice 10 touches generation persistence and state management.
- **Merge recommendation:** Either can land first. No dependency between them.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```
Phase 1 + Phase 2 complete ✅
  ├── #293 Read-Path Optimization (parallel, no overlap with #294)
  └── #294 Persistence Simplification (parallel, no overlap with #293)
```

**Rationale:** Both slices are fully independent — no shared files, no data dependencies. They can be implemented and merged in any order or in parallel.

### Shared File Map

| File                                                 | #293                         | #294                          |
| ---------------------------------------------------- | ---------------------------- | ----------------------------- |
| `src/lib/db/schema/tables/plans.ts`                  | —                            | ✅ (drop `planGenerations`)   |
| `src/lib/db/schema/tables/users.ts`                  | ✅ (add `cancelAtPeriodEnd`) | —                             |
| `src/lib/db/queries/plans.ts`                        | ✅ (lightweight summaries)   | —                             |
| `src/lib/db/queries/attempts.ts`                     | —                            | ✅ (refactor state mutations) |
| `src/lib/db/queries/helpers/attempts-persistence.ts` | —                            | ✅ (remove dual write)        |
| `src/features/plans/lifecycle/plan-operations.ts`    | —                            | ✅ (sole state owner)         |
| `src/features/plans/cleanup.ts`                      | —                            | ✅ (delegate to plan-ops)     |
| `src/app/api/v1/plans/route.ts`                      | ✅ (pagination)              | —                             |
| `src/app/api/v1/user/subscription/route.ts`          | ✅ (remove Stripe call)      | —                             |
| `src/features/billing/subscriptions.ts`              | ✅ (sync cancelAtPeriodEnd)  | —                             |
| `src/shared/types/db.types.ts`                       | ✅ (LightweightPlanSummary)  | ✅ (remove PlanGeneration)    |

**Zero overlap** on critical paths. `db.types.ts` is touched by both but in completely different type definitions.
