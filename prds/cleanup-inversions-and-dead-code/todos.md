# Todos: Clean Up Remaining Inversions and Dead Code

> **PRD:** `prds/cleanup-inversions-and-dead-code/prd.md`
> **Prerequisites:** PRDs 1–3 are **not yet completed**. All fixes below are written for the current codebase state and do not depend on those PRDs landing first.

---

## Dependency Graph

```
#245 ──→ #257   (metrics side-effect must move before metrics module simplification)

#247, #250, #253, #260 are fully independent of each other and of the chain above.
```

---

## 1. Remove metrics side-effect from DB query layer

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#245](https://github.com/saldanaj97/atlaris/issues/245) |
| **Priority**   | 🔴 HIGH                                                  |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

### What

`src/lib/db/queries/attempts.ts` imports `recordAttemptSuccess` and `recordAttemptFailure` from `src/features/plans/metrics.ts` (line 34). This is an inverted dependency — the infrastructure layer (DB queries) should not depend on the feature layer.

### Changes

- [x] **`src/lib/db/queries/attempts.ts`** — Removed imports of `recordAttemptSuccess` / `recordAttemptFailure` from `@/features/plans/metrics` and removed the calls inside `finalizeAttemptSuccess` / `finalizeAttemptFailure`.
- [x] **`src/features/plans/metrics.ts`** — Deleted the in-process metrics module entirely instead of moving calls to the orchestrator. Structured observability remains via `logAttemptEvent(...)` in `attempts.ts`, which is already captured by the logging pipeline.
- [x] **Tests for `attempts.ts`** — Updated observability integration coverage to assert emitted log events instead of in-process state mutations.

### Verification

- `db/queries/attempts.ts` has **zero** imports from `src/features/`.
- Structured attempt success/failure logging still fires for every finalized attempt via `logAttemptEvent(...)`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

## 2. Delete deprecated billing functions and update tests

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#247](https://github.com/saldanaj97/atlaris/issues/247) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed (already landed)                            |
| **Depends on** | Nothing                                                  |

> **Note:** Issue #270 overlaps on the function deletion. A comment has been added to #270 clarifying that #247 owns the deletion; #270 is scoped to test file relocation only (gated behind #268).

### What

Three `@deprecated` functions in `features/billing/usage.ts` have zero production consumers — only test files reference them:

- `checkRegenerationLimit` (line ~122)
- `checkExportLimit` (line ~144)
- `checkPdfPlanQuota` (line ~180)

### Changes

- [x] **`src/features/billing/usage.ts`** — Deprecated billing functions are no longer present in the current codebase.
- [x] **`tests/integration/stripe/usage.spec.ts`** — Tests already target the atomic usage path.
- [x] **`tests/unit/pdf/usage.spec.ts`** — Tests already use the current PDF usage behavior.
- [x] **`tests/e2e/pdf-to-plan.spec.ts`** — Deprecated PDF quota checks were already removed.

### Verification

- `grep -r 'checkRegenerationLimit\|checkExportLimit\|checkPdfPlanQuota' src/ tests/` returns zero results.
- Atomic functions have equivalent or better test coverage.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

## 3. Consolidate duplicate retryability logic

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#250](https://github.com/saldanaj97/atlaris/issues/250) |
| **Priority**   | 🟢 LOW                                                   |
| **Status**     | ✅ Completed (already landed)                            |
| **Depends on** | Nothing                                                  |

### What

Two divergent definitions of "which failure classifications are retryable":

| Location                                             | Approach  | Logic                                                        |
| ---------------------------------------------------- | --------- | ------------------------------------------------------------ |
| `features/ai/failures.ts`                            | Exclusion | NOT in `['validation', 'capped']` → retryable                |
| `features/jobs/regeneration-worker.ts` (lines 45–51) | Inclusion | IN `['timeout', 'rate_limit', 'provider_error']` → retryable |

The **exclusion approach** is safer (treats unknown classifications as retryable). Since PRD 1 has not been executed, keep the canonical definition in `features/ai/failures.ts`.

### Changes

- [x] **`src/features/jobs/regeneration-worker.ts`** — No inline retryable classification logic remains in the current worker flow.
- [x] **`src/features/ai/failures.ts`** — Canonical retryability export already exists.

### Verification

- `grep -rn 'isRetryable\|retryable.*classification' src/features/ai/ src/features/jobs/` shows exactly one definition (in `failures.ts`) and import-only references elsewhere.
- `regeneration-worker.ts` tests pass.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

## 4. Extract admin query function from `db/queries/jobs.ts`

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#253](https://github.com/saldanaj97/atlaris/issues/253) |
| **Priority**   | 🟢 LOW                                                   |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

### What

`getSystemWideJobMetrics()` (lines 56–109 in `jobs.ts`) is the only function using `serviceRoleDb` directly. The other 8+ functions accept injected `dbClient` or use `getDb()`. Mixing service-role in an otherwise RLS-compatible module pollutes the import graph.

### Changes

- [x] **Create `src/lib/db/queries/admin/jobs-metrics.ts`** — Moved `getSystemWideJobMetrics` into a dedicated admin/monitoring query module with service-role JSDoc.
- [x] **`src/lib/db/queries/jobs.ts`** — Removed `getSystemWideJobMetrics` and the `serviceRoleDb` import.
- [x] **Consumer files** — Updated the worker health route to import `getSystemWideJobMetrics` from the new admin module.

### Verification

- `db/queries/jobs.ts` has **zero** imports from `@/lib/db/service-role` (or however service-role is imported).
- `src/lib/db/queries/admin/jobs-metrics.ts` has JSDoc explaining admin-only purpose.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

## 5. Simplify in-process metrics to structured logging

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Issue**      | [#257](https://github.com/saldanaj97/atlaris/issues/257)     |
| **Priority**   | 🟢 LOW                                                       |
| **Status**     | ✅ Completed                                                 |
| **Depends on** | **#245** (metrics calls must be moved to orchestrator first) |

### What

`features/plans/metrics.ts` (228 lines) maintains module-level mutable state (`let state: AttemptMetricsState`) that resets on cold start in Vercel's serverless environment. Sentry already captures these events through the Pino integration, making the in-process state machine misleading.

### Changes (Option A — preferred)

- [x] **`src/features/plans/metrics.ts`** — Removed the in-process metrics state machine entirely; the module is no longer needed.
- [x] **Tests for `metrics.ts`** — Reworked the observability integration test to assert structured attempt log emission.
- [x] **`src/features/ai/orchestrator.ts`** — No metrics relocation was needed because attempt observability already flows through `logAttemptEvent(...)` in the query layer.

### Verification

- `features/plans/metrics.ts` no longer exists.
- `resetAttemptMetrics` and `getAttemptMetricsSnapshot` have zero references.
- Sentry receives structured log entries for attempt success/failure.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

## 6. Document `features/jobs/queue.ts` thin wrapper

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#260](https://github.com/saldanaj97/atlaris/issues/260) |
| **Priority**   | 🟢 LOW                                                   |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

### What

`features/jobs/queue.ts` (68 lines) is a thin wrapper where 5 of 6 exports are one-liner delegations to `@/lib/db/queries/jobs`, binding the service-role DB client. The wrapper is justified (centralizes service-role binding), but lacks documentation.

### Changes

- [x] **`src/features/jobs/queue.ts`** — Added module-level JSDoc explaining the wrapper's purpose:
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
- [x] No structural or behavioral changes.

### Verification

- JSDoc is present and accurate.
- `pnpm type-check && pnpm lint` pass.

---

## Suggested Execution Order

| Order | Todo                                | Reason                                     |
| ----- | ----------------------------------- | ------------------------------------------ |
| 1     | #245 — Metrics side-effect          | Highest impact; unblocks #257              |
| 2     | #250 — Retryability logic           | Quick win, removes divergence risk         |
| 3     | #260 — Document queue.ts            | Trivial, documentation only                |
| 4     | #247 — Deprecated billing functions | Requires test updates but low risk         |
| 5     | #253 — Admin query extraction       | Small, clean extraction                    |
| 6     | #257 — Simplify metrics             | Largest change; blocked until #245 is done |

Items 1–5 can be parallelized (except #257 which must wait for #245).

---

## Review

### 2026-03-17

- Implemented #245 by removing the last `src/lib/db/queries/* → src/features/*` import in `src/lib/db/queries/attempts.ts`.
- Implemented #253 by extracting `getSystemWideJobMetrics` to `src/lib/db/queries/admin/jobs-metrics.ts` and updating the worker health route import.
- Implemented #257 by deleting the non-durable `src/features/plans/metrics.ts` state machine and rewriting observability coverage to assert emitted attempt logs instead.
- Implemented #260 by documenting the service-role queue wrapper in `src/features/jobs/queue.ts`.
- Verified #247 and #250 were already complete in the current codebase before this implementation.
- Validation passed: `pnpm type-check`, `pnpm lint`, and `pnpm test:changed`.
