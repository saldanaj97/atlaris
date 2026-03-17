# PRD: Clean Up Remaining Inversions and Dead Code

## Problem Statement

After PRDs 1-3 address the major structural issues (dependency direction violations, plan domain consolidation, god module splits), several smaller but concrete architectural problems remain:

1. **Inverted dependency: DB queries → feature metrics.** `src/lib/db/queries/attempts.ts` imports `recordAttemptSuccess` and `recordAttemptFailure` from `src/features/plans/metrics.ts`. This means the infrastructure layer (DB queries) has a hard dependency on the feature layer, violating the dependency direction contract. The DB query module should perform persistence only — metrics recording is a side effect that belongs in the orchestrator or a higher-level caller.

2. **Three deprecated billing functions with test-only consumers.** `checkRegenerationLimit`, `checkExportLimit`, and `checkPdfPlanQuota` in `features/billing/usage.ts` are marked `@deprecated` and have zero production consumers. Their only consumers are test files that test the deprecated functions directly instead of the atomic replacements (`atomicCheckAndIncrementUsage`, `atomicCheckAndIncrementPdfUsage`).

3. **Duplicate retryability logic.** `features/ai/failures.ts` defines `isRetryableClassification` (checks if classification is NOT `validation` or `capped`). Meanwhile, `features/jobs/regeneration-worker.ts` has an inline duplicate with **divergent semantics** — it explicitly lists `timeout`, `rate_limit`, `provider_error` as retryable rather than using the exclusion approach. If a new classification is added, one definition will consider it retryable and the other may not, depending on which list it's added to.

4. **Service-role usage in `db/queries/jobs.ts`.** `getSystemWideJobMetrics()` is the only function in the file that uses `serviceRoleDb` directly. The remaining 8+ functions accept injected `dbClient` or default to `getDb()`. Mixing service-role access in an otherwise RLS-compatible query module means any import of this module transitively pulls in the service-role client.

5. **Non-durable in-process metrics.** `features/plans/metrics.ts` (228 lines) maintains module-level mutable state (`let state: AttemptMetricsState`) that resets on process restart. In Vercel's serverless environment, this provides minimal observability value since each invocation may cold-start. Sentry already captures these events through the Pino integration.

6. **Thin wrapper assessment: `features/jobs/queue.ts`.** 68 lines where 5 of 6 exported functions are one-liner delegations to `@/lib/db/queries/jobs`. The only value-add is hardcoding the service-role `db` client. This adds an import hop without meaningful abstraction.

## Prerequisites

- **PRD 1** should be completed or in progress, as it may relocate `isRetryableClassification` to `src/shared/constants/failure-classification.ts`, which affects item 3.
- **PRD 2** should be completed, as it moves plan lifecycle functions out of `billing/usage.ts`, which affects the line count of item 2.
- **PRD 3** should be completed or in progress, as it splits `billing/usage.ts` and `attempts-helpers.ts`, which affects the file structure for items 1 and 2.

## Solution

Six targeted fixes, each independently shippable:

1. Remove the metrics side-effect from DB queries and move it to the orchestrator.
2. Delete deprecated billing functions and update their test consumers.
3. Consolidate the duplicate retryability logic into a single canonical definition.
4. Extract `getSystemWideJobMetrics` from `db/queries/jobs.ts` into a dedicated admin query module.
5. Simplify or remove the in-process metrics state machine.
6. Evaluate the `jobs/queue.ts` thin wrapper and either justify or inline it.

## User Stories

1. As a developer modifying DB query functions, I want query modules to have no side effects beyond persistence, so that I can test them without mocking feature-layer metrics.
2. As a developer maintaining billing tests, I want tests to exercise the current atomic quota functions rather than deprecated non-atomic predecessors, so that test coverage matches production behavior.
3. As a developer adding a new failure classification, I want exactly one definition of "retryable" to update, so that all consumers agree on retry semantics.
4. As a developer importing job query functions in an API route, I want the import to not transitively pull in service-role client code, so that ESLint restrictions and mental models remain clean.
5. As a developer debugging production metrics, I want metrics to come from a durable source (Sentry), not from in-process state that resets on cold start, so that I get reliable observability.

## Implementation Details

### 1. Remove Metrics Side-Effect from DB Queries (HIGH Priority)

**Current state:**

`src/lib/db/queries/attempts.ts` calls:

- `recordAttemptSuccess(attempt)` inside `finalizeAttemptSuccess` (line 279)
- `recordAttemptFailure(attempt)` inside `finalizeAttemptFailure` (line 399)

These are imported from `src/features/plans/metrics.ts`.

**Change:**

Remove the `recordAttemptSuccess`/`recordAttemptFailure` calls from `attempts.ts`. The orchestrator (`src/features/ai/orchestrator.ts`) already calls `finalizeAttemptSuccess`/`finalizeAttemptFailure` — add metrics recording there, after the DB operation completes.

```typescript
// orchestrator.ts — after finalization
const attempt = await finalizeAttemptSuccess(...);
recordAttemptSuccess(attempt);
return attempt;
```

This moves the side-effect to the feature layer (where it belongs) and makes the DB query module pure persistence.

**Files to change:**

| File                              | Change                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/db/queries/attempts.ts`  | Remove `recordAttemptSuccess`/`recordAttemptFailure` imports and calls |
| `src/features/ai/orchestrator.ts` | Add metrics recording after successful/failed finalization             |
| Tests for `attempts.ts`           | Remove expectations about metrics side-effects                         |

**Verification:** `db/queries/attempts.ts` has zero imports from `src/features/`. The metrics recording still fires for every attempt success/failure, just from a different call site.

### 2. Delete Deprecated Billing Functions (MEDIUM Priority)

**Current state:**

Three deprecated functions in `features/billing/usage.ts`:

- `checkRegenerationLimit(userId)` — deprecated in favor of `atomicCheckAndIncrementUsage`
- `checkExportLimit(userId)` — deprecated in favor of atomic increment
- `checkPdfPlanQuota(userId)` — deprecated in favor of `atomicCheckAndIncrementPdfUsage`

**Consumers (all test files):**

- `tests/integration/stripe/usage.spec.ts` — 14 references to `checkRegenerationLimit` and `checkExportLimit`
- `tests/unit/pdf/usage.spec.ts` — 2 references to `checkPdfPlanQuota`
- `tests/e2e/pdf-to-plan.spec.ts` — 5 references to `checkPdfPlanQuota`

**Change:**

1. Delete the three deprecated functions from `billing/usage.ts` (or from `billing/quota.ts` if PRD 3 has been executed).
2. Update test files to test the atomic replacements instead:
   - Replace `checkRegenerationLimit` tests with `atomicCheckAndIncrementUsage` tests
   - Replace `checkPdfPlanQuota` tests with `atomicCheckAndIncrementPdfUsage` tests
   - Replace `checkExportLimit` tests with the appropriate atomic alternative (or remove if export limits are checked differently)

**Verification:** `pnpm test:all` passes. No references to the deleted function names remain. The atomic functions have equivalent or better test coverage.

### 3. Consolidate Duplicate Retryability Logic (LOW Priority)

**Current state:**

Two definitions of "which failure classifications are retryable":

| Location                                        | Approach       | Logic                                                        |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------ |
| `features/ai/failures.ts`                       | Exclusion list | NOT in `['validation', 'capped']` → retryable                |
| `features/jobs/regeneration-worker.ts` (inline) | Inclusion list | IN `['timeout', 'rate_limit', 'provider_error']` → retryable |

These produce different results if a new classification is added: the exclusion approach treats unknowns as retryable; the inclusion approach treats unknowns as non-retryable.

**Change:**

If PRD 1 has been executed, `isRetryableClassification` will live in `src/shared/constants/failure-classification.ts`. Update `regeneration-worker.ts` to import and use the canonical definition instead of its inline duplicate.

If PRD 1 has NOT been executed yet, consolidate by:

1. Keeping `isRetryableClassification` in `features/ai/failures.ts` (or moving it to `failure-presentation.ts` since `failures.ts` is only 10 lines)
2. Updating `regeneration-worker.ts` to import the canonical function
3. Deleting the inline duplicate

**Decision on semantics:** The exclusion approach (treating unknown classifications as retryable) is safer — it ensures new classification types default to retry rather than permanent failure. Adopt the exclusion approach as canonical.

**Files to change:**

| File                                                     | Change                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `features/jobs/regeneration-worker.ts`                   | Remove inline `isRetryable` logic, import canonical function |
| `features/ai/failures.ts` (or `failure-presentation.ts`) | Keep or merge the canonical definition                       |

**Verification:** Grep for `retryable` across `features/ai/` and `features/jobs/` confirms exactly one definition. `regeneration-worker.ts` tests pass.

### 4. Extract Admin Query Function from `db/queries/jobs.ts` (LOW Priority)

**Current state:**

`getSystemWideJobMetrics()` (lines 56-109 of `jobs.ts`) uses `serviceRoleDb` directly for cross-tenant monitoring queries. The remaining 8+ functions use `getDb()` or accept injected clients.

**Change:**

Extract `getSystemWideJobMetrics()` into a new file: `src/lib/db/queries/admin/jobs-metrics.ts`.

This file explicitly imports `service-role` and documents that it is for admin/monitoring use only. The main `jobs.ts` module becomes clean of service-role imports.

**Files to change:**

| File                                       | Change                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| `src/lib/db/queries/admin/jobs-metrics.ts` | NEW — contains `getSystemWideJobMetrics`                    |
| `src/lib/db/queries/jobs.ts`               | Remove `getSystemWideJobMetrics` and `serviceRoleDb` import |
| Internal drain endpoint                    | Update import path                                          |

**Verification:** `db/queries/jobs.ts` has zero imports from `@/lib/db/service-role`. The admin query module is clearly marked as service-role only.

### 5. Simplify In-Process Metrics (LOW Priority)

**Current state:**

`features/plans/metrics.ts` (228 lines) maintains a module-level `AttemptMetricsState` object with counters for success/failure counts, classification breakdowns, timing percentiles, and normalization stats. This state resets on process restart (cold start in serverless).

Sentry already captures these events through the Pino integration (attempt success/failure logs include all the same metadata).

**Options:**

- **Option A (preferred): Simplify to thin logging wrappers.** Reduce `metrics.ts` to 30-40 lines that emit structured log events with the relevant metadata. Sentry captures these for aggregation. Remove the in-process state machine entirely.
- **Option B: Keep but document limitations.** Add clear documentation that this module provides best-effort in-process metrics that are not durable. Useful only for within-request diagnostics or local development.
- **Option C: No change.** Accept the current design and focus effort elsewhere.

**Recommendation:** Option A. The in-process counters provide false confidence — they show accurate numbers during a single invocation but misleading numbers across invocations. Structured logs + Sentry provide durable, aggregatable observability.

**Files to change (Option A):**

| File                                         | Change                                                         |
| -------------------------------------------- | -------------------------------------------------------------- |
| `features/plans/metrics.ts`                  | Replace state machine with structured log calls (~30-40 lines) |
| Tests for `metrics.ts`                       | Simplify to verify log output rather than state mutations      |
| `features/ai/orchestrator.ts` (after fix #1) | Verify metrics calls produce expected log entries              |

**Verification:** Sentry receives structured log entries for every attempt success/failure. `resetAttemptMetrics` and `getAttemptMetricsSnapshot` are removed (or converted to no-ops if any consumer depends on them).

### 6. Assess `features/jobs/queue.ts` Thin Wrapper (LOW Priority)

**Current state:**

68 lines. 5 of 6 exports are one-liner delegations to `@/lib/db/queries/jobs`, binding `service-role db` as the client. 3 production consumers.

**Assessment:**

The wrapper serves a legitimate purpose: it ensures all queue operations use service-role DB (correct for background workers with no user session). Inlining would mean each consumer imports `service-role` directly, which:

- Spreads service-role imports across more files
- Increases the risk of a consumer accidentally using service-role in a request handler context

**Decision: Keep, but document.**

Add a JSDoc comment explaining the module's purpose:

```typescript
/**
 * Queue operations for background workers.
 *
 * All functions bind the service-role DB client because queue operations
 * run in worker context without a user session. This module exists to
 * centralize that binding and prevent service-role imports from spreading
 * to multiple consumer files.
 */
```

No structural change needed. The thin-wrapper pattern is justified here.

## Migration Strategy

Each of the 6 fixes is independently shippable. Suggested order:

1. **Fix #1 (metrics side-effect)** — Highest impact. Fixes the last `lib/ → features/` import in `db/queries/attempts.ts`.
2. **Fix #3 (duplicate retryability)** — Quick fix. Removes divergence risk.
3. **Fix #2 (deprecated functions)** — Requires test updates but no production code changes.
4. **Fix #4 (admin query extraction)** — Small, clean extraction.
5. **Fix #5 (simplify metrics)** — Larger change but low risk (metrics are observability, not correctness).
6. **Fix #6 (queue.ts assessment)** — Documentation only.

Each fix should be its own commit (or small PR) for clean review.

## Verification

For each fix:

1. `pnpm type-check` passes with zero errors.
2. `pnpm lint` passes.
3. `pnpm test:changed` passes for affected files.
4. After all fixes: `db/queries/attempts.ts` has zero imports from `src/features/`.
5. After all fixes: grep for `@deprecated` in `features/billing/` returns zero results.
6. After all fixes: grep for `isRetryable` logic returns exactly one canonical definition.

## Out of Scope

- The `features/billing/errors.ts` → `lib/api/errors.ts` dependency (features extending `AppError` is the CORRECT dependency direction).
- Moving `FailureClassification` to `src/shared/` (covered in PRD 1).
- Moving generation policy constants to `src/shared/` (covered in PRD 1).
- Splitting `billing/usage.ts` (covered in PRD 3).
- Breaking up `attempts-helpers.ts` or `openrouter.ts` (covered in PRD 3).
