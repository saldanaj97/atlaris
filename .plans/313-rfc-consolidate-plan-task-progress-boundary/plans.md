# 313 — RFC: consolidate plan task progress boundary

Issue: https://github.com/saldanaj97/atlaris/issues/313

## Issue Summary

Task progress updates are not simple status writes. A status change affects ownership checks, task-progress persistence, module locking, completed-task and completed-module stats, optimistic UI behavior, visible plan/module state, error handling, and path revalidation.

Current code handles those semantics in several places:

- `src/app/plans/[id]/actions.ts` validates plan-level batches, writes progress, and revalidates plan paths.
- `src/app/plans/[id]/modules/[moduleId]/actions.ts` repeats batch validation, adds module-specific ownership checks, writes progress, and revalidates module/plan paths.
- `src/lib/db/queries/tasks.ts` owns SQL ownership checks and `task_progress` upsert behavior.
- `src/hooks/useTaskStatusBatcher.ts` owns optimistic batching, dedupe, net-zero cancellation, timers, failure toast, and unmount flushing.
- `src/app/plans/[id]/helpers.ts`, `PlanTimeline.tsx`, `PlanDetails.tsx`, `ModuleHeader.tsx`, and `ModuleLessonsClient.tsx` derive visible stats, module status, locks, active module expansion, and next lesson behavior.

That split means the UI and server paths can drift. The goal is to create one focused task-progress boundary that applies progress updates and returns the visible plan/module state that callers need, while keeping components focused on interaction/rendering.

## Current State

### Server Actions

- `src/app/plans/[id]/actions.ts` exposes `batchUpdateTaskProgressAction({ planId, updates })`.
- `batchUpdateTaskProgressAction` validates `planId`, empty batches, max batch size, task ids, and status values before `requestBoundary.action`.
- Inside the boundary, it calls `setTaskProgressBatch(actor.id, updates, db)` and revalidates `/plans/${planId}` plus `/plans`.
- It does not confirm that every task in the batch belongs to `planId` before persistence; it relies on `setTaskProgressBatch` for user ownership only.
- `src/app/plans/[id]/modules/[moduleId]/actions.ts` exposes `batchUpdateModuleTaskProgressAction({ planId, moduleId, updates })`.
- The module action repeats validation, then calls `ensureBatchModuleTaskOwnership(db, planId, moduleId, taskIds, actor.id)` before `setTaskProgressBatch`.
- The module action revalidates `/plans/${planId}/modules/${moduleId}`, `/plans/${planId}`, and `/plans`.
- Both actions convert persistence errors into the same generic user-facing message, but logging context differs.

### DB Query Layer

- `src/lib/db/queries/tasks.ts` provides `getAllTasksInPlan` and `setTaskProgressBatch`.
- `setTaskProgressBatch` validates duplicate task ids, performs one SQL ownership check for multi-item batches, and upserts `task_progress`.
- Single-item batches route through private `setTaskProgress`, which performs a separate transaction and ownership check.
- Persistence uses `new Date()` for `completedAt` and `updatedAt`.
- The query returns raw `DbTaskProgress[]`, not derived visible plan/module state.

### UI And Derived State

- `src/hooks/useTaskStatusBatcher.ts` is a reusable client hook, but the status update contract is still "send updates and hope revalidation catches up."
- `src/app/plans/[id]/components/PlanDetails.tsx` and `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailClient.tsx` duplicate the same optimistic update pattern with local status refs and batcher wiring.
- `src/app/plans/[id]/helpers.ts` computes overview/detail stats from a plan plus an optimistic status map.
- `src/app/plans/[id]/components/PlanTimeline.tsx` derives module status, active module id, completed module ids, and expanded module behavior locally.
- `src/app/plans/[id]/modules/[moduleId]/components/ModuleHeader.tsx` derives module completion stats locally.
- `src/app/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient.tsx` derives lesson locks, first unlocked incomplete lesson, and module-complete CTA locally.

### Existing Tests

- `tests/unit/app/plans/actions.spec.ts` only covers oversized plan-level batches.
- `tests/unit/hooks/useTaskStatusBatcher.spec.tsx` covers timer/max-wait batching behavior.
- `tests/unit/app/plans/helpers.spec.ts` covers some plan stat derivation.
- Search did not show focused tests for `setTaskProgressBatch`, module action ownership/revalidation, `PlanTimeline` module-state derivation, or module lesson-lock derivation.

## Proposed Boundary

Create a feature-owned boundary under `src/features/plans/task-progress/` that owns progress update application plus visible-state derivation.

Recommended public surface:

```ts
export interface ApplyTaskProgressUpdatesInput {
  userId: string;
  planId: string;
  moduleId?: string;
  updates: Array<{ taskId: string; status: ProgressStatus }>;
  dbClient: TasksDbClient;
}

export interface TaskProgressUpdateResult {
  progress: DbTaskProgress[];
  revalidatePaths: string[];
  visibleState: TaskProgressVisibleState;
}

export async function applyTaskProgressUpdates(
  input: ApplyTaskProgressUpdatesInput,
): Promise<TaskProgressUpdateResult>;
```

Recommended split:

- `boundary.ts` — validates request shape, scopes updates to `planId` / optional `moduleId`, calls persistence, reloads the minimal read model, and returns revalidation paths.
- `persistence.ts` — wraps or moves `setTaskProgressBatch` behavior without leaking UI state concerns into `src/lib/db/queries/tasks.ts`.
- `visible-state.ts` — pure functions for deriving plan stats, module status, active module id, lesson locks, and module completion from modules + statuses.
- `types.ts` — boundary input/output types.
- `index.ts` — narrow public exports.

Do not put this under `src/app/plans/[id]/...`; that would keep the semantics trapped in route/page code. Do not move all DB query helpers into the feature boundary immediately; use a narrow adapter first, then collapse only if implementation proves the old query helper is no longer useful.

## Proposed Approach

### Step 0.0 — Confirm Scope And Acceptance Criteria

Treat this as a boundary consolidation, not a visual redesign.

Acceptance criteria to verify against the live issue:

- One task-progress boundary applies plan-level and module-level progress batches.
- The boundary enforces authenticated user ownership plus the declared plan/module scope before writing.
- Server actions delegate validation, persistence, visible-state refresh, and revalidation path selection to the boundary instead of re-encoding them.
- UI components consume derived visible state or pure derivation helpers rather than owning business-state rules.
- Optimistic batching remains client-side but uses the boundary contract as its single server write path.
- Tests cover update application, ownership/scope rejection, completion/module-state derivation, required revalidation paths, and focused component rendering/interactions.

### Step 1.0 — Extract Pure Progress Derivation

Move the derivation logic that is business-state, not rendering, into `src/features/plans/task-progress/visible-state.ts`.

Start with pure functions:

- `buildTaskStatusMap(modules)` to replace `getStatusesFromModules`.
- `derivePlanProgressStats(plan, statuses)` to replace `computeOverviewStats` and `computeDetailsCardStats` duplication with one shared calculation plus thin output adapters if needed.
- `deriveModuleProgressState(module, statuses, previousModulesCompleted)` to replace `getModuleStatus`.
- `deriveActiveModuleId(modules, statuses)` and `deriveCompletedModuleIds(modules, statuses)` to replace local `PlanTimeline` helpers.
- `deriveLessonLocks(lessons, statuses, previousModulesComplete)` and `deriveFirstUnlockedIncompleteLessonId(...)` to replace `ModuleLessonsClient` local business logic.
- `deriveModuleCompletionSummary(module, statuses)` to replace `ModuleHeader` local counts.

Keep React components responsible for layout, interaction, and choosing which section is expanded. They should not decide what "locked", "active", or "complete" means.

### Step 2.0 — Create Server Boundary For Applying Updates

Add `applyTaskProgressUpdates` in `src/features/plans/task-progress/boundary.ts`.

Responsibilities:

- Reject empty plan ids and module ids at the boundary.
- Validate batch size and progress statuses once.
- Normalize and dedupe task ids deterministically.
- Confirm every task belongs to the authenticated user and the declared `planId`.
- If `moduleId` is provided, confirm every task belongs to that module.
- Persist the batch through `setTaskProgressBatch` or a moved persistence helper.
- Reload the minimal post-write state needed for callers.
- Return revalidation paths from the same domain decision point.

Important: plan-level updates must not rely only on "task belongs to user". If a caller sends `planId=A` and task ids from `planId=B`, the current plan action can revalidate A while writing B. That is the exact kind of distributed semantic drift this boundary should eliminate.

### Step 3.0 — Migrate Server Actions To Thin Delegates

Update server actions to become boundary adapters:

- `src/app/plans/[id]/actions.ts` should call `requestBoundary.action`, then `applyTaskProgressUpdates({ userId: actor.id, planId, updates, dbClient: db })`, then revalidate returned paths.
- `src/app/plans/[id]/modules/[moduleId]/actions.ts` should call the same boundary with `moduleId`.
- Delete `ensureBatchModuleTaskOwnership` from the module action once module scoping lives in the boundary.
- Remove duplicated validation constants from server actions unless they remain exported from the boundary for UI copy/tests.
- Keep user-facing errors stable unless tests prove a more specific message is already expected.

Server actions should not compute ownership rules, module scope rules, duplicate handling, or revalidation path lists.

### Step 4.0 — Migrate UI To Shared Derivation Without UI Churn

Move consumers gradually:

- `src/app/plans/[id]/helpers.ts` should either re-export thin adapters from `src/features/plans/task-progress` or be reduced to page-result helpers only.
- `PlanDetails.tsx` should keep optimistic status handling but call shared plan stat derivation.
- `PlanTimeline.tsx` should call shared module-state derivation and stop defining `getModuleStatus`, `getActiveModuleIdForStatuses`, and `getCompletedModuleIds` locally.
- `ModuleHeader.tsx` should use shared module-completion summary.
- `ModuleLessonsClient.tsx` should use shared lesson-lock derivation.
- `ModuleDetailClient.tsx` and `PlanDetails.tsx` can keep the same `useTaskStatusBatcher` API initially; do not combine plan and module clients unless duplication remains obvious after the boundary exists.

Avoid styling churn. This issue is not about UI appearance.

### Step 5.0 — Tests

Add focused tests before broad rewrites.

Boundary and persistence:

- Plan-level batch writes only tasks under the declared plan.
- Module-level batch writes only tasks under the declared plan and module.
- Cross-plan task ids are rejected before or during persistence.
- Cross-module task ids are rejected for module-scoped updates.
- Duplicate task ids are rejected or normalized consistently with the chosen contract.
- Empty updates are no-op with no DB writes and no revalidation paths.
- Completed tasks get `completedAt`; non-completed statuses clear it.
- Returned revalidation paths match plan-level and module-level callers.

Pure derivation:

- Plan stats ignore orphaned status entries.
- Plan stats correctly apply optimistic deltas over canonical completed-task counts.
- Module state derives `locked`, `active`, and `completed` consistently.
- Active module id advances after a module completes.
- Lesson locks respect previous-module completion and prior lesson completion.
- Module completion summary powers header and CTA behavior.

Existing tests to update or extend:

- `tests/unit/app/plans/actions.spec.ts`
- `tests/unit/hooks/useTaskStatusBatcher.spec.tsx`
- `tests/unit/app/plans/helpers.spec.ts`

Likely new tests:

- `tests/unit/features/plans/task-progress/visible-state.spec.ts`
- `tests/integration/features/plans/task-progress/apply-updates.spec.ts`
- `tests/unit/app/plans/modules/actions.spec.ts`

### Step 6.0 — Validation

Minimum implementation validation:

- `pnpm exec vitest run tests/unit/features/plans/task-progress/visible-state.spec.ts`
- `pnpm exec vitest run tests/unit/app/plans/actions.spec.ts tests/unit/app/plans/modules/actions.spec.ts`
- `pnpm exec vitest run tests/unit/hooks/useTaskStatusBatcher.spec.tsx`
- `pnpm exec vitest run tests/integration/features/plans/task-progress/apply-updates.spec.ts`
- `pnpm test:changed`
- `pnpm check:full`

If `pnpm test:changed` fails because Docker/Testcontainers is unavailable, record the exact environment failure and run the strongest targeted unit subset plus any integration subset available through the repo-supported fallback. Do not call that full validation.

### Step 7.0 — Issue Verification And Closure

Before closing issue `#313`, verify:

- `rg "setTaskProgressBatch" src/app src/features src/lib` shows app actions no longer call the DB helper directly.
- `rg "ensureBatchModuleTaskOwnership|getModuleStatus|getActiveModuleIdForStatuses|getCompletedModuleIds|isLessonLocked" src/app src/features` shows business-state helpers moved out of components/actions or intentionally re-exported only.
- `rg "batchUpdateTaskProgressAction|batchUpdateModuleTaskProgressAction" src/app tests` shows both server actions still exist for form/action compatibility but are thin adapters.
- Boundary tests prove plan-scope and module-scope rejection.
- Pure derivation tests prove visible-state behavior without rendering the whole UI.
- Component tests stay focused on rendering/interactions.

Close the issue only after implementation merges or the user explicitly asks to close it earlier.

## Risks

- Hidden behavior can move during extraction. Derivation tests should lock current semantics before changing components.
- Plan-level update scope is likely under-validated today because it only passes `userId` and task ids to `setTaskProgressBatch`. The boundary should fix that deliberately, not preserve drift.
- Over-centralizing React interaction state would create a god hook. Keep optimistic batching in `useTaskStatusBatcher` unless a real duplication remains after server and derivation boundaries are extracted.
- Integration tests for DB ownership need Testcontainers or the repo-supported DB fallback.
- Revalidation path selection must stay explicit; missing `/plans` or module detail revalidation will create stale visible state.

## Non-Goals

- Do not redesign task status values or database schema.
- Do not change page styling or module card layout.
- Do not remove `useTaskStatusBatcher` in this pass.
- Do not move route protection or auth boundary behavior.
- Do not refactor unrelated plan read projection code.
- Do not broaden into schedule/calendar task progress unless current code paths require it.

## Open Questions

- Should `applyTaskProgressUpdates` return a full refreshed plan/module DTO, or only derived visible state plus persisted rows? Current recommendation: return minimal visible state and revalidation paths first; avoid coupling the write boundary to the full read projection unless consumers need it.
- Should duplicate task ids stay rejected as they are today, or should the boundary normalize last-write-wins to match client batching behavior? Current recommendation: keep server rejection for explicit invalid payloads; client batching can still dedupe before sending.
- Should `completedAt` and `updatedAt` use DB time (`now()`) instead of Node time? Current recommendation: evaluate during implementation because adjacent code has had DB-clock flake issues, but do not mix that change into the boundary unless tests expose a concrete need.
- Should plan and module client optimistic patterns be unified into a shared hook? Current recommendation: defer until after the boundary extraction; doing it first is comfort-cleanup, not root-cause work.
