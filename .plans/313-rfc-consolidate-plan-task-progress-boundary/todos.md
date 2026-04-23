# 313 — RFC: consolidate plan task progress boundary

Issue: [https://github.com/saldanaj97/atlaris/issues/313](https://github.com/saldanaj97/atlaris/issues/313)
Plan: `./plans.md`

## Acceptance Criteria

- AC1 — A focused task-progress boundary owns applying plan-level and module-level task progress batches.
- AC2 — The boundary enforces authenticated user ownership and declared plan/module scope before writing progress.
- AC3 — Plan and module server actions delegate validation, persistence, visible-state refresh, and revalidation path selection to the boundary.
- AC4 — UI components render and interact with progress state without owning business-state derivation rules for stats, locks, active modules, or completion.
- AC5 — Optimistic batching still works through `useTaskStatusBatcher`, but the server write path is unified.
- AC6 — Tests cover update application, ownership/scope rejection, completion/module-state derivation, required revalidation paths, and focused component rendering/interactions.
- AC7 — Validation includes targeted unit/integration tests, `pnpm test:changed`, and `pnpm check:full`.

## Tasks (aligned with plans.md Steps)

### Step 0.0 — Confirm Scope

- Load live issue `#313` and confirm title/body/labels/state against GitHub.
- Confirm `.plans/` is the active planning root and no existing `.plans/313-*` package exists.
- Inspect `src/app/plans/[id]/actions.ts`.
- Inspect `src/app/plans/[id]/modules/[moduleId]/actions.ts`.
- Inspect `src/app/plans/[id]/helpers.ts`, `PlanDetails.tsx`, and `PlanTimeline.tsx`.
- Inspect module progress consumers under `src/app/plans/[id]/modules/[moduleId]/components/`.
- Inspect `src/hooks/useTaskStatusBatcher.ts`.
- Inspect `src/lib/db/queries/tasks.ts`.
- Inventory existing tests for actions, batching, and derivation.

### Step 1.0 — Extract Pure Progress Derivation

- Create `src/features/plans/task-progress/visible-state.ts`.
- Move or recreate `buildTaskStatusMap(modules)` from `getStatusesFromModules`.
- Move plan stat derivation from `src/app/plans/[id]/helpers.ts` into feature-owned pure functions.
- Move module status, active module id, and completed module id derivation out of `PlanTimeline.tsx`.
- Move lesson lock and first-unlocked-incomplete derivation out of `ModuleLessonsClient.tsx`.
- Move module completion summary derivation out of `ModuleHeader.tsx`.
- Add pure unit tests for the moved derivation behavior.

### Step 2.0 — Create Server Boundary For Applying Updates

- Create `src/features/plans/task-progress/boundary.ts`.
- Define boundary input/output types in `src/features/plans/task-progress/types.ts`.
- Add a narrow public barrel in `src/features/plans/task-progress/index.ts`.
- Validate plan id, optional module id, update count, task ids, progress statuses, and duplicates in one place.
- Enforce that all updates belong to the authenticated user and declared `planId`.
- Enforce that module-scoped updates belong to the declared `moduleId`.
- Persist updates through `setTaskProgressBatch` or a moved persistence helper.
- Return revalidation paths for plan-level and module-level callers.
- Return minimal visible state needed by callers, or document why revalidation-only is enough for the first implementation slice.

### Step 3.0 — Migrate Server Actions To Thin Delegates

- Update `batchUpdateTaskProgressAction` to delegate to `applyTaskProgressUpdates`.
- Update `batchUpdateModuleTaskProgressAction` to delegate to `applyTaskProgressUpdates` with `moduleId`.
- Delete `ensureBatchModuleTaskOwnership` from the module action after boundary scope checks exist.
- Remove duplicated validation constants from actions when boundary-owned.
- Revalidate only paths returned by the boundary.
- Preserve current user-facing error behavior unless tests document a better contract.
- Add or update action tests for unauthenticated, invalid payload, boundary failure, success, and revalidation behavior.

### Step 4.0 — Migrate UI To Shared Derivation Without UI Churn

- Update `src/app/plans/[id]/helpers.ts` to re-export thin adapters or keep only page-result helpers.
- Update `PlanDetails.tsx` to use shared plan stats/status helpers.
- Update `PlanTimeline.tsx` to use shared module-state helpers.
- Update `ModuleHeader.tsx` to use shared module completion summary.
- Update `ModuleLessonsClient.tsx` to use shared lesson lock helpers.
- Keep `useTaskStatusBatcher` API stable unless a test-backed simplification is obvious.
- Avoid styling/layout changes.

### Step 5.0 — Tests

- Add `tests/unit/features/plans/task-progress/visible-state.spec.ts`.
- Add `tests/integration/features/plans/task-progress/apply-updates.spec.ts`.
- Add or update `tests/unit/app/plans/actions.spec.ts`.
- Add `tests/unit/app/plans/modules/actions.spec.ts` if no module-action coverage exists.
- Keep `tests/unit/hooks/useTaskStatusBatcher.spec.tsx` passing and extend only if the boundary contract changes its inputs.
- Add tests for cross-plan update rejection.
- Add tests for cross-module update rejection.
- Add tests for revalidation path selection.
- Add tests for module active/locked/completed derivation and lesson locks.

### Step 6.0 — Validation Steps

- Run `pnpm exec vitest run tests/unit/features/plans/task-progress/visible-state.spec.ts`.
- Run `pnpm exec vitest run tests/unit/app/plans/actions.spec.ts tests/unit/app/plans/modules/actions.spec.ts`.
- Run `pnpm exec vitest run tests/unit/hooks/useTaskStatusBatcher.spec.tsx`.
- Run `pnpm exec vitest run tests/integration/features/plans/task-progress/apply-updates.spec.ts`.
- Run `pnpm test:changed`.
- Run `pnpm check:full`.
- If Docker/Testcontainers blocks integration validation, record the exact failure and strongest targeted fallback.

### Step 7.0 — Issue Verification & Closure

- Walk each acceptance criterion with direct file/test evidence.
- Fill the evidence table below with commands, paths, and outcomes.
- Record `rg "setTaskProgressBatch" src/app src/features src/lib` evidence.
- Record `rg "ensureBatchModuleTaskOwnership|getModuleStatus|getActiveModuleIdForStatuses|getCompletedModuleIds|isLessonLocked" src/app src/features` evidence.
- Comment or otherwise capture implementation evidence on issue `#313` after implementation.
- Close issue `#313` only after the implementing PR merges or the user explicitly asks for closure.

## Review

### Deviations / notes

- Plan package created on 2026-04-23 from live issue `#313` plus current source inspection.
- Existing tree was already dirty from unrelated work; this planning pass only created `.plans/313-rfc-consolidate-plan-task-progress-boundary/`.
- `src/app/plans/[id]/actions.ts` already uses `requestBoundary.action`, so this plan does not spend scope on auth-boundary migration.
- `src/app/plans/[id]/modules/[moduleId]/actions.ts` has stricter module-scope validation than the plan action today; the new boundary should make plan/module scope checks consistent.
- `useTaskStatusBatcher` is not the root problem. Rewriting it first would be comfortable cleanup while leaving ownership/revalidation/visible-state semantics split.

### Evidence table (Step 6.0)


| Acceptance Criterion | Evidence                |
| -------------------- | ----------------------- |
| AC1                  | Pending implementation. |
| AC2                  | Pending implementation. |
| AC3                  | Pending implementation. |
| AC4                  | Pending implementation. |
| AC5                  | Pending implementation. |
| AC6                  | Pending implementation. |
| AC7                  | Pending implementation. |


### Security Review Checklist (plans.md)

- Boundary uses authenticated `requestBoundary.action` actor id for ownership.
- Boundary uses request-scoped DB client, not service-role shortcuts.
- Plan-level updates reject task ids outside the declared `planId`.
- Module-level updates reject task ids outside the declared `moduleId`.
- User-facing errors do not leak other users' task ids, plan ids, or module ids.
- Tests include unauthorized/cross-user or cross-scope rejection behavior.

### Validation excerpts

- Not run. This task created planning artifacts only.

### Follow-ups

- Decide during implementation whether `completedAt` / `updatedAt` should move to DB time (`now()`) in the task-progress persistence path.