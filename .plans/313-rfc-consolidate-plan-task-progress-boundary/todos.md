# 313 — RFC: consolidate plan task progress boundary

Issue: https://github.com/saldanaj97/atlaris/issues/313 (closed after implementation comment; work uncommitted locally)
Plan: `./plans.md`

## Acceptance Criteria

- [x] AC1 — A focused task-progress boundary owns applying plan-level and module-level task progress batches.
- [x] AC2 — The boundary enforces authenticated user ownership and declared plan/module scope before writing progress.
- [x] AC3 — Plan and module server actions delegate validation, persistence, visible-state refresh, and revalidation path selection to the boundary.
- [x] AC4 — UI components render and interact with progress state without owning business-state derivation rules for stats, locks, active modules, or completion.
- [x] AC5 — Optimistic batching still works through `useTaskStatusBatcher`, but the server write path is unified.
- [x] AC6 — Tests cover update application, ownership/scope rejection, completion/module-state derivation, required revalidation paths, and focused component rendering/interactions.
- [x] AC7 — Validation includes targeted unit/integration tests, `pnpm test:changed`, and `pnpm check:full`.

## Tasks (aligned with plans.md Steps)

### Step 0.0 — Confirm Scope

- [x] Load live issue `#313` and confirm title/body/labels/state against GitHub.
- [x] Confirm `.plans/` is the active planning root and no existing `.plans/313-*` package exists.
- [x] Inspect `src/app/plans/[id]/actions.ts`.
- [x] Inspect `src/app/plans/[id]/modules/[moduleId]/actions.ts`.
- [x] Inspect `src/app/plans/[id]/helpers.ts`, `PlanDetails.tsx`, and `PlanTimeline.tsx`.
- [x] Inspect module progress consumers under `src/app/plans/[id]/modules/[moduleId]/components/`.
- [x] Inspect `src/hooks/useTaskStatusBatcher.ts`.
- [x] Inspect `src/lib/db/queries/tasks.ts`.
- [x] Inspect existing read-projection progress metrics in `src/features/plans/read-projection/completion-metrics.ts`.
- [x] Inspect read-only API route consumer `src/app/api/v1/plans/[planId]/tasks/route.ts`.
- [x] Inventory existing tests for actions, batching, derivation, and status constants.

### Step 1.0 — Extract Pure Progress Derivation

- [x] Compare needed progress derivation against `src/features/plans/read-projection/completion-metrics.ts` and reuse/wrap existing helpers where semantics match. (Plan/client stats stay on nested `ClientPlanDetail` + optimistic map; read-projection metrics remain for SQL/read path — no duplicate math introduced.)
- [x] Create `src/features/plans/task-progress/visible-state.ts`.
- [x] Move or recreate `buildTaskStatusMap(modules)` from `getStatusesFromModules`.
- [x] Move plan stat derivation from `src/app/plans/[id]/helpers.ts` into feature-owned pure functions.
- [x] Move module status, active module id, and completed module id derivation out of `PlanTimeline.tsx`.
- [x] Move lesson lock and first-unlocked-incomplete derivation out of `ModuleLessonsClient.tsx`.
- [x] Move module completion summary derivation out of `ModuleHeader.tsx`.
- [x] Keep `UpdateTaskStatusButton.tsx` and `TaskStatusButton.tsx` presentational; do not add boundary/batching knowledge there.
- [x] Add pure unit tests for moved derivation behavior and any read-projection wrapper behavior.

### Step 2.0 — Create Server Boundary For Applying Updates

- [x] Create `src/features/plans/task-progress/boundary.ts`.
- [x] Define boundary input/output types in `src/features/plans/task-progress/types.ts`.
- [x] Add a narrow public barrel in `src/features/plans/task-progress/index.ts`.
- [x] Validate plan id, optional module id, update count, task ids, canonical progress statuses, and duplicates in one place.
- [x] Enforce that all updates belong to the authenticated user and declared `planId`.
- [x] Enforce that module-scoped updates belong to the declared `moduleId`.
- [x] Persist updates through `setTaskProgressBatch` or a moved persistence helper.
- [x] Reload post-write state through an existing read projection/query helper or a deliberately narrow new helper. **Deviation:** visible state is derived from `setTaskProgressBatch` return rows only (`appliedByTaskId`), not a second read projection query.
- [x] Return revalidation paths for plan-level and module-level callers.
- [x] Return a typed boundary result with persisted rows, revalidation paths, and minimal visible state.
- [x] If server actions keep returning `Promise<void>`, document that as a compatibility adapter and keep tests against the boundary result.

### Step 3.0 — Migrate Server Actions To Thin Delegates

- [x] Update `batchUpdateTaskProgressAction` to delegate to `applyTaskProgressUpdates`.
- [x] Update `batchUpdateModuleTaskProgressAction` to delegate to `applyTaskProgressUpdates` with `moduleId`.
- [x] Delete `ensureBatchModuleTaskOwnership` from the module action after boundary scope checks exist.
- [x] Remove duplicated validation constants from actions when boundary-owned.
- [x] Revalidate only paths returned by the boundary.
- [x] Decide whether server actions return a typed payload or keep `Promise<void>` over the boundary result. **Kept `Promise<void>`**; boundary result tested directly.
- [x] If action return type changes, update `useTaskStatusBatcher`'s `flushAction` type without coupling the hook to task-progress domain types. (No change required.)
- [x] Preserve current user-facing error behavior unless tests document a better contract.
- [x] Add or update action tests for unauthenticated, invalid payload, boundary failure, success, and revalidation behavior.

### Step 4.0 — Migrate UI To Shared Derivation Without UI Churn

- [x] Update `src/app/plans/[id]/helpers.ts` to re-export thin adapters or keep only page-result helpers.
- [x] Update `PlanDetails.tsx` to use shared plan stats/status helpers. (Still imports `computeOverviewStats` / `getStatusesFromModules` from helpers; those delegate to feature.)
- [x] Update `PlanTimeline.tsx` to use shared module-state helpers.
- [x] Update `ModuleHeader.tsx` to use shared module completion summary.
- [x] Update `ModuleLessonsClient.tsx` to use shared lesson lock helpers.
- [x] Keep `useTaskStatusBatcher` API stable unless a test-backed simplification is obvious.
- [x] Avoid styling/layout changes.

### Step 5.0 — Tests

- [x] Add `tests/unit/features/plans/task-progress/visible-state.spec.ts`.
- [x] Add `tests/integration/features/plans/task-progress/apply-updates.spec.ts`.
- [x] Add or update `tests/unit/app/plans/actions.spec.ts`.
- [x] Add `tests/unit/app/plans/modules/actions.spec.ts` if no module-action coverage exists.
- [x] Keep `tests/unit/hooks/useTaskStatusBatcher.spec.tsx` passing and extend only if the boundary contract changes its inputs.
- [x] Add tests for cross-plan update rejection.
- [x] Add tests for cross-module update rejection.
- [x] Add tests for revalidation path selection.
- [x] Add tests that boundary visible state is returned in the selected shape.
- [x] Replace stale fake status mocks in `tests/unit/app/plans/actions.spec.ts` with canonical `PROGRESS_STATUSES` values. (Resolved via partial mock of `applyTaskProgressUpdates` + real `validateTaskProgressBatchInput` from `importActual`.)
- [x] Add tests for module active/locked/completed derivation and lesson locks.

### Step 6.0 — Validation Steps

- [x] Run `pnpm exec vitest run tests/unit/features/plans/task-progress/visible-state.spec.ts`.
- [x] Run `pnpm exec vitest run tests/unit/app/plans/actions.spec.ts tests/unit/app/plans/modules/actions.spec.ts`.
- [x] Run `pnpm exec vitest run tests/unit/hooks/useTaskStatusBatcher.spec.tsx`.
- [x] Run `pnpm exec vitest run tests/integration/features/plans/task-progress/apply-updates.spec.ts`.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.
- [x] If Docker/Testcontainers blocks integration validation, record the exact failure and strongest targeted fallback. (Not needed — Testcontainers passed.)

### Step 7.0 — Issue Verification & Closure

- [x] Walk each acceptance criterion with direct file/test evidence.
- [x] Fill the evidence table below with commands, paths, and outcomes.
- [x] Record `rg "setTaskProgressBatch" src/app src/features src/lib` evidence.
- [x] Record `rg "ensureBatchModuleTaskOwnership|getModuleStatus|getActiveModuleIdForStatuses|getCompletedModuleIds|isLessonLocked" src/app src/features` evidence.
- [x] Record `rg "PROGRESS_STATUSES|progressStatus.enumValues" tests/unit/app/plans src/features/plans/task-progress src/app/plans` evidence.
- [x] Comment or otherwise capture implementation evidence on issue `#313` after implementation.
- [x] Close issue `#313` only after the implementing PR merges or the user explicitly asks for closure. **Closed per explicit user request** (2026-04-23); work not yet committed.

## Review

### Deviations / notes

- Plan package created on 2026-04-23 from live issue `#313` plus current source inspection.
- **Post-write visible state:** boundary returns `appliedByTaskId` from `setTaskProgressBatch` returning rows, not `getPlanDetailForRead` / `getModuleDetail` reload (narrower than plans.md “reload” bullet).
- Removed unused `src/app/plans/[id]/server/task-progress-action-deps.ts` after actions stopped importing it.
- Issue #313 closed with implementation comment; **no git commit** per user.

### Evidence table (Step 6.0)

| Acceptance Criterion | Evidence |
| --- | --- |
| AC1 | `src/features/plans/task-progress/boundary.ts` — `applyTaskProgressUpdates`; both actions call it. |
| AC2 | `assertTaskIdsInPlanScopeForUser` / `assertTaskIdsInModuleScopeForUser` in `src/lib/db/queries/tasks.ts`; integration `apply-updates.spec.ts` cross-plan / cross-module. |
| AC3 | `src/app/plans/[id]/actions.ts`, `src/app/plans/[id]/modules/[moduleId]/actions.ts` — validate → boundary → `revalidatePath` over returned paths only. |
| AC4 | `PlanTimeline.tsx`, `ModuleHeader.tsx`, `ModuleLessonsClient.tsx` import `derive*` from `@/features/plans/task-progress`. |
| AC5 | `useTaskStatusBatcher` unchanged; `PlanDetails` / `ModuleDetailClient` still pass same flush actions. |
| AC6 | Unit: `visible-state.spec.ts`, `validate-input.spec.ts`, `actions.spec.ts`, `modules/actions.spec.ts`; integration: `apply-updates.spec.ts`. |
| AC7 | `pnpm test:changed` ✓; `pnpm check:full` ✓ (2026-04-23). |

### Security Review Checklist (plans.md)

- [x] Boundary uses authenticated `requestBoundary.action` actor id for ownership.
- [x] Boundary uses request-scoped DB client, not service-role shortcuts. (Actions pass `db` from boundary; integration tests use service-role `db` intentionally.)
- [x] Plan-level updates reject task ids outside the declared `planId`.
- [x] Module-level updates reject task ids outside the declared `moduleId`.
- [x] Status validation uses canonical `progressStatus.enumValues` via `PROGRESS_STATUSES` in `validateTaskProgressBatchInput`.
- [x] User-facing errors do not leak other users' task ids, plan ids, or module ids.
- [x] Tests include unauthorized/cross-user or cross-scope rejection behavior.

### Validation excerpts

```text
$ rtk pnpm exec vitest run tests/unit/features/plans/task-progress/visible-state.spec.ts tests/unit/features/plans/task-progress/validate-input.spec.ts tests/unit/app/plans/actions.spec.ts tests/unit/app/plans/modules/actions.spec.ts tests/unit/hooks/useTaskStatusBatcher.spec.tsx tests/unit/app/plans/helpers.spec.ts
Test Files  6 passed (6)

$ rtk pnpm exec vitest run tests/integration/features/plans/task-progress/apply-updates.spec.ts
Test Files  1 passed (1)

$ rtk pnpm test:changed
Changed test bundle passed

$ rtk pnpm check:full
lint + type passed
```

### `rg` evidence (Step 7.0)

```text
$ rtk rg "setTaskProgressBatch" src/app src/features src/lib
src/lib/db/queries/tasks.ts
src/features/plans/task-progress/boundary.ts
(no src/app matches)
```

```text
$ rtk rg "ensureBatchModuleTaskOwnership|getModuleStatus|getActiveModuleIdForStatuses|getCompletedModuleIds|isLessonLocked" src/app src/features
src/features/plans/task-progress/visible-state.ts — isLessonLockedAtIndex (private; replaces removed `isLessonLocked` in app)
```

```text
$ rtk rg "PROGRESS_STATUSES|progressStatus.enumValues" tests/unit/app/plans src/features/plans/task-progress src/app/plans
src/features/plans/task-progress/boundary.ts — PROGRESS_STATUSES from @/shared/types/db
```

### Follow-ups

- [ ] Decide during implementation whether `completedAt` / `updatedAt` should move to DB time (`now()`) in the task-progress persistence path.
- [ ] Implement actual module-task-specific write wiring so explicit plan/module scope helpers are used or deleted instead of lingering as reminders.
