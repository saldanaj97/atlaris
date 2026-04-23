# 309 — RFC: Deepen Regeneration Orchestration Boundary

Issue: https://github.com/saldanaj97/atlaris/issues/309
Plan: `./plan.md`

## Acceptance Criteria

- [x] AC1 — Regeneration route reduced to HTTP/auth preflight, request parsing, response mapping, and route-specific headers. No direct imports of orchestration internals (see plan.md "Things the route must stop importing").
- [x] AC2 — Worker reduced to drain loop + inline-drain primitives. No direct imports of orchestration internals (see plan.md "Things the worker must stop importing").
- [x] AC3 — `src/features/plans/regeneration-orchestration/` package exists with the exact public surface declared in plan.md "Public API Contract" (plus `rateLimit` on `RegenerationOrchestrationDeps` — see Review note).
- [x] AC4 — `runRegenerationQuotaReserved` is preserved as the quota seam and consumed via `deps.quota.runReserved`. Compensation/reconciliation semantics unchanged.
- [x] AC5 — Missing-plan and wrong-owner plan collapse to a single `plan-not-found-or-unauthorized` outcome with identical telemetry, verified by test.
- [x] AC6 — Inline-drain decision (lock acquisition, drain scheduling, register call, error logging) lives entirely inside the boundary; route and worker do not touch inline-drain primitives.
- [x] AC7 — Boundary tests cover every case enumerated in plan.md Step 4.0 "Boundary tests". Route and worker tests are slimmed per Step 4.0 with no net coverage loss.
- [x] AC8 — `pnpm test:changed` and `pnpm check:full` pass clean.
- [x] AC9 — Security Review Checklist in plan.md all checked with file/line evidence.

## Tasks (aligned with plan.md Steps)

### Step 0.0 — Confirm Scope

- [x] Run `gh issue view 309 --repo saldanaj97/atlaris` and confirm body matches plan.md "Current State".
- [x] Confirm `.plans/309-deepen-request-boundary/` remains untouched.

### Step 1.0 — Create Boundary Package

- [x] Create `src/features/plans/regeneration-orchestration/types.ts` with `PlanRegenerationOverrides`, `RequestPlanRegenerationArgs`, `RequestPlanRegenerationResult`, `ProcessPlanRegenerationJobResult`.
- [x] Create `src/features/plans/regeneration-orchestration/schema.ts` with canonical `planRegenerationJobPayloadSchema` (moved from `regeneration-worker.ts`).
- [x] Create `src/features/plans/regeneration-orchestration/deps.ts` with `RegenerationOrchestrationDeps` interface and `createDefaultRegenerationOrchestrationDeps(dbClient)` factory.
- [x] Create `src/features/plans/regeneration-orchestration/request.ts` with `requestPlanRegeneration` (empty shell + TODO stubs).
- [x] Create `src/features/plans/regeneration-orchestration/process.ts` with `processNextPlanRegenerationJob` and `processPlanRegenerationJob` (empty shells + TODO stubs).
- [x] Create `src/features/plans/regeneration-orchestration/index.ts` barrel exporting only the public surface declared in plan.md.
- [x] Verify no Drizzle types leak across the barrel (`pnpm tsc --noEmit`).

### Step 2.0 — Move Enqueue Orchestration Out of Route

- [x] Implement `requestPlanRegeneration` per plan.md Step 2.0 "Boundary owns" list.
- [x] Wire `deps.quota.runReserved` with `work()` returning `RegenerationQuotaWorkResult` for `consumed`/`revert` per plan.md Step 2.0.
- [x] Wire inline-drain scheduling inside the `enqueued` branch exactly matching current `p.catch(...); register(p);` ordering.
- [x] Rewrite `src/app/api/v1/plans/[planId]/regenerate/route.ts`:
  - [x] Remove imports listed in "Things the route must stop importing".
  - [x] Single call to `requestPlanRegeneration({ userId, planId, overrides, inlineProcessingEnabled })`.
  - [x] Outcome → HTTP mapping per plan.md Step 2.0 "Route keeps" §6.
  - [x] Plan-generation rate-limit: check runs in boundary (`deps.rateLimit.check`); 202 response headers from `planGenerationRateLimit` snapshot (see Review deviation).
- [x] Confirm 202 JSON body shape `{ planId, jobId, status: 'pending' }` unchanged.
- [x] Confirm 503/404/409/429/500 body and header shapes unchanged.

### Step 3.0 — Move Job Execution Semantics Out of Worker

- [x] Implement `processPlanRegenerationJob(job, deps)` per plan.md Step 3.0 "Boundary owns" list.
- [x] Implement `processNextPlanRegenerationJob(deps)` as `getNextJob` + `processPlanRegenerationJob` delegation.
- [x] Rewrite `src/features/jobs/regeneration-worker.ts`:
  - [x] Delete file-private `planRegenerationJobPayloadSchema` (moved to boundary).
  - [x] Remove imports listed in "Things the worker must stop importing".
  - [x] `drainRegenerationQueue` default `processNextJob` binds to boundary's `processNextPlanRegenerationJob`.
  - [x] Keep `tryAcquireInlineDrainLock`, `registerInlineDrain`, `waitForInlineRegenerationDrains` exports unchanged.
  - [x] Keep `drainRegenerationQueue` public signature + result shape unchanged.
- [x] Confirm `src/app/api/internal/jobs/regeneration/process/route.ts` still works without changes (it calls `drainRegenerationQueue` only).

### Step 4.0 — Tests

- [x] Add `tests/unit/features/plans/regeneration-orchestration/request.spec.ts` covering all cases in plan.md Step 4.0 "Boundary tests (new)" request list.
- [x] Add `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` covering all cases in plan.md Step 4.0 "Boundary tests (new)" process list.
- [x] Slim `tests/integration/api/plans.regenerate.spec.ts` to HTTP/auth/mapping only; mock `requestPlanRegeneration`.
- [x] Slim `tests/unit/jobs/regeneration-worker.spec.ts` to drain-loop + `processNextJob` seam only.
- [x] Keep `tests/unit/jobs/regeneration-worker-inline-drain.spec.ts` unchanged.
- [x] Update `tests/integration/api/regeneration-worker-process.spec.ts` to route through boundary; behavior assertions unchanged.
- [x] Keep `tests/unit/features/billing/regeneration-quota-boundary.spec.ts` unchanged.
- [x] Keep `tests/unit/components/RegenerateButton.spec.tsx` unchanged.
- [x] Net coverage audit: every assertion removed from route/worker specs must have a matching assertion in boundary specs. Record mapping in PR description.

### Step 5.0 — Validation

- [x] `pnpm test tests/unit/features/plans/regeneration-orchestration/` passes.
- [x] `pnpm test tests/integration/api/plans.regenerate.spec.ts` passes.
- [x] `pnpm test tests/integration/api/regeneration-worker-process.spec.ts` passes.
- [x] `pnpm test:changed` passes.
- [x] `pnpm check:full` passes.

### Step 6.0 — Issue Verification & Closure

- [x] Fill in the evidence table from plan.md Step 6.0 with concrete file paths + line numbers.
- [x] Walk the Security Review Checklist from plan.md and mark each item with file/line evidence.
- [x] Comment the evidence table on issue 309.
- [ ] Close issue 309 once the PR merges.

## Review

### Deviations / notes

- **Rate limit placement:** `checkPlanGenerationRateLimit` runs inside the boundary via `deps.rateLimit.check` (after active-job dedupe, before quota) so 409 still wins over durable-window 429 when both apply. Response headers on 202 still come from the snapshot taken in that same check (`planGenerationRateLimit` on the `enqueued` result). `RegenerationOrchestrationDeps` includes `rateLimit` (not in the plan’s pasted contract block) to support this without a second DB read on the route.
- **Inline drain module:** `src/features/jobs/regeneration-inline-drain.ts` holds the process-singleton Set so `deps.ts` avoids a static import cycle with `regeneration-worker.ts`. Default `inlineDrain.drain` now uses dynamic `import()` of `drainRegenerationQueue`, so the route no longer injects drain wiring and matches the plan's single-call contract.
- **Quota conflict semantics:** `runRegenerationQuotaReserved` exposes compensation failures on dedupe as `reconciliationRequired` on the reverted conflict result, not a separate boundary union variant. Dead `compensation-failed` route/boundary plumbing was removed so the public contract matches real quota behavior.
- **Queue claim clock source:** `claimNextPendingJob` now uses Postgres `now()` for `scheduled_for <= now()` matching. This avoids Node-vs-DB clock skew that could leave freshly enqueued jobs temporarily invisible to the worker and changed integration suite.
- **`PlanRegenerationOverrides`:** Aliased to `PlanRegenerationOverridesInput` in `types.ts` to satisfy Biome `useImportType` without a runtime `zod` schema import in the barrel.

### Evidence table (Step 6.0)

| Acceptance Criterion | Evidence |
| --- | --- |
| AC1: route reduced to HTTP/auth preflight + mapping | `src/app/api/v1/plans/[planId]/regenerate/route.ts:L23-L119` |
| AC2: worker reduced to drain + inline primitives | `src/features/jobs/regeneration-worker.ts:L1-L105` |
| AC3: boundary package public surface | `src/features/plans/regeneration-orchestration/index.ts:L1-L22` |
| AC4: quota seam preserved and called from boundary | `src/features/plans/regeneration-orchestration/request.ts:L50-L99` |
| AC5: combined missing/wrong-owner failure | `src/features/plans/regeneration-orchestration/process.ts:L94-L142` |
| AC6: inline-drain scheduling in boundary | `src/features/plans/regeneration-orchestration/request.ts:L108-L127` |
| AC7: boundary tests | `tests/unit/features/plans/regeneration-orchestration/request.spec.ts`, `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` |
| AC8: validation passed | `pnpm test:changed` exit 0; `pnpm check:full` exit 0 (2026-04-23) |

### Security Review Checklist (plan.md)

| Item | Evidence |
| --- | --- |
| Auth stays in `withAuthAndRateLimit`; boundary never authenticates | `src/app/api/v1/plans/[planId]/regenerate/route.ts:L24-L25` |
| Plan ownership check inside boundary before enqueue work | `src/features/plans/regeneration-orchestration/request.ts:L22-L27` |
| Missing-plan and wrong-owner → single outcome + same `failJob` message | `src/features/plans/regeneration-orchestration/process.ts:L129-L142`; `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` (missing + wrong-owner cases) |
| No Drizzle query-builder types exported from boundary barrel | `src/features/plans/regeneration-orchestration/index.ts` exports only listed types + fns |
| No new service-role access pattern | `process.ts` uses `deps.dbClient` (default `serviceRoleDb` for worker); `request.ts` uses `getDb()` via default deps |
| Rate-limit / generation window headers on 202 | `src/app/api/v1/plans/[planId]/regenerate/route.ts:L105-L109` (from `result.planGenerationRateLimit`) |
| Inline-drain `logger.error` fields | `src/features/plans/regeneration-orchestration/request.ts:L112-L120` (`planId`, `userId`, `error`, `inlineProcessingEnabled`, `drainFn`) |
| Sentry reconciliation on compensation failure | Unchanged in `src/features/billing/regeneration-quota-boundary.ts` (`recordBillingReconciliationRequired` default deps) |

### Validation excerpts

- `pnpm test:changed`: changed unit + integration bundles passed (Vitest 4.1.4, 2026-04-23 run).
- `pnpm check:full`: `biome check` + `tsgo --noEmit` both exit 0 (2026-04-23 run).

### Follow-ups

- Close issue 309 after push/merge lands; evidence comment already posted on the issue.
