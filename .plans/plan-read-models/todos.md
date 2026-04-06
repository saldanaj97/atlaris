# Plan Read Models Deepening

## Objective

Create a real read-model boundary for signed-in plan experiences so pages and APIs stop manually coordinating auth wrappers, query calls, mappers, and local derivations.

## Todo

- [x] Produce initial current-state research for candidate `#4` ("Plan read models") under `.plans/`.
- [x] Confirm that GitHub issue `#4` is unrelated and should not drive this scope.
- [x] Freeze the actual scope of the effort.
  - AC: Decide whether the target boundary primarily serves pages, pages + APIs, or separate consumers.
  - AC: Decide whether module detail is part of the same effort or a follow-up slice.
  - AC: Decide whether schedule loading is included or explicitly excluded.
- [x] Define the current-state fracture lines with concrete evidence.
  - AC: Capture where plans list/dashboard/billing reassemble overlapping state manually.
  - AC: Capture where plan detail/module detail duplicate access + loader + mapping layers.
  - AC: Capture where loader/mapping tests are preserving shallow seams instead of business boundaries.
- [x] Resolve what the future deep modules should be.
  - AC: Decide whether overview and detail are one boundary or two.
  - AC: Decide where derived view semantics belong: page layer vs read-model layer.
  - AC: Decide whether API DTO mapping remains a thin adapter or becomes part of the core interface.
- [x] Convert the research into an implementation-ready plan.
  - AC: Break work into slices with ordering and overlap called out explicitly.
  - AC: Include TDD-first validation strategy and expected test deletions/replacements.
  - AC: Keep the plan in `.plans/plan-read-models/`, not `prds/`.
- [x] Audit and refine the implementation-ready plan before coding begins.
  - AC: Verify phase-one scope has no missing consumers.
  - AC: Verify access-contract decision includes concrete module detail migration path.
  - AC: Verify layer-retention strategy names at least one concrete layer to remove and specifies semantic migration paths for absorbed layers.
  - AC: Verify summary-family status ownership is explicit and `getNextTaskName()` disposition is decided.
  - AC: Verify detail-family distinguishes canonical semantics from page-local re-derivation.
  - AC: Verify test migration classifies every relevant test file and specifies concrete guard replacement.

## Implementation Todo

- [x] Build the summary-family canonical read model.
  - AC: One canonical summary source serves `/plans`, dashboard summary consumers, and the list API.
  - AC: Summary status semantics come from one canonical derivation.
  - AC: `getPlanStatus()` becomes a thin page adapter; `getNextTaskName()` stays page-local and documented.
- [x] Normalize module detail to the explicit ownership contract.
  - AC: `getModuleDetail` requires `userId`.
  - AC: Module detail query enforces explicit ownership in SQL, with RLS remaining defense-in-depth.
  - AC: Module detail tenant-isolation tests are expanded.
- [x] Build the detail-family canonical read models.
  - AC: Plan detail owns plan/modules/tasks/resources/attempt summary semantics.
  - AC: Module detail owns module navigation/task/resource/progress semantics.
  - AC: Sorting, defaults, anomaly handling, and classification masking all move into canonical detail boundaries.
- [x] Thin the page and API adapters.
  - AC: `getPlanForPage()` and `getModuleForPage()` remain thin auth/error adapters.
  - AC: Detail API, attempts API, and status API derive from canonical detail boundaries instead of separate truth sources.
  - AC: Status API no longer re-derives status through an independent query path.
- [x] Remove fake seams and redundant derivation.
  - AC: Delete `src/app/plans/[id]/data.ts` and `src/app/plans/[id]/modules/[moduleId]/data.ts`.
  - AC: `detail-mapper.ts` is removed only after all five behaviors have named replacements.
  - AC: Page helpers stop re-counting `totalTasks`/`completedTasks` when canonical values already exist.
- [x] Migrate and tighten tests around the real boundaries.
  - AC: Delete forwarding-loader tests.
  - AC: Replace the regex guard with a concrete behavioral protection for explicit ownership.
  - AC: Keep and update status/classification-masking tests.
  - AC: Add summary/detail boundary tests and keep security/tenant-isolation coverage intact.
- [x] Update transport/docs fallout and validate the slice.
  - AC: Update `LightweightPlanSummary` OpenAPI schema if list API shape changes.
  - AC: Run `pnpm lint:changed`, `pnpm test:changed`, and `pnpm type-check`.
  - AC: Verify the implementation still reads as two explicit read-model families, not a generic architecture cleanup.

## Review Notes

- 2026-04-05: Initial research shows the repo has staged assembly rather than a true read-model boundary. The biggest planning risk is confusing "reorganize queries" with "define who owns the read contract."
- 2026-04-05: Phase one is now locked to `/plans` list/detail/module-detail, dashboard summary consumers, and plan list/detail/attempts APIs where they share the same underlying read-model work. Billing/settings composition and schedule data are explicitly out of scope.
- 2026-04-05: The target contract is explicit ownership input for plan-facing reads. Pages are the primary consumers; APIs remain thin secondary adapters over the same canonical read-model families.
- 2026-04-05: The implementation-ready plan lives in [plan.md](/Users/juansaldana/Dev/Projects/atlaris/.plans/plan-read-models/plan.md).
- 2026-04-05: Plan audit completed. Key refinements applied:
  - **Scope:** Status API route (`/api/v1/plans/[planId]/status/route.ts`) added to detail-family. It was a missing read consumer using `derivePlanStatus()` through a separate code path.
  - **Access contract:** Concrete module migration target specified — add `userId` to `getModuleDetail` + explicit WHERE clause matching the `plans.ts` pattern. Ambient RLS stays as defense-in-depth.
  - **Layer retention:** Full matrix with explicit semantic migration paths. `detail-mapper.ts` five behaviors (status derivation, classification masking, sorting, defaults, anomaly logging) must each have a named destination before deletion. `derivePlanStatus()` survives as shared module, must not be duplicated.
  - **Summary family:** Canonical summary owns `generationStatus + completion` status. `getPlanStatus()` becomes thin adapter adding staleness. `getNextTaskName()` lie kept page-local with documentation — fixing it is scope creep.
  - **Detail family:** Double-derivation problem fixed — page helpers consume canonical `totalTasks`/`completedTasks`, don't re-count. Module detail must get same defensive contracts (sorting, defaults) as plan detail. Status API route must consume from canonical model, not re-query independently.
  - **Test migration:** `derivation.spec.ts` classified as KEEP. Guard replacement specified as behavioral test covering both `plans.ts` and `modules.ts`. Module tenant-isolation tests to expand once `getModuleDetail` gains `userId`. New boundary tests specified with concrete assertions.
- 2026-04-05: Final validation pass found no new scope or architecture gaps. Remaining fixes were plan-artifact consistency issues only: Step 1.0 now includes the status API in the detail track, and the file-change plan now explicitly calls out likely changes to `src/features/plans/status.ts`, `src/app/plans/components/plan-utils.ts`, `src/app/dashboard/components/activity-utils.ts`, and `src/app/plans/[id]/helpers.ts`.
- 2026-04-05: Follow-up implementation completed the remaining read-model unification work for this slice:
  - Status polling now flows through `getPlanStatusForUser()` in `src/lib/db/queries/plans.ts`, which builds a canonical detail-family status snapshot from owned-plan data instead of re-deriving status in `src/app/api/v1/plans/[planId]/status/route.ts`.
  - `src/features/plans/read-models/detail.ts` now owns the shared detail-family status snapshot builder used by both detail mapping and the status API path.
  - `src/app/plans/components/plan-utils.ts` now derives page status from the canonical summary status and only adds the page-local paused/staleness interpretation.
  - `src/app/dashboard/components/activity-utils.ts` now picks the active plan from canonical summary status instead of raw `completion < 1`.
  - Added boundary coverage in `tests/unit/plans/summary-boundaries.spec.ts` for canonical summary status, paused adapter behavior, and dashboard active-plan selection.
- 2026-04-05: Targeted validation after the follow-up slice:
  - Passed: `tests/unit/mappers/planQueries.spec.ts`
  - Passed: `tests/unit/mappers/detailToClient.spec.ts`
  - Passed: `tests/unit/mappers/derivation.spec.ts`
  - Passed: `tests/unit/plans/summary-boundaries.spec.ts`
  - Passed: `tests/integration/db/plans.queries.spec.ts`
  - Passed: `tests/integration/db/modules.queries.spec.ts`
  - Passed: `tests/integration/db/plans.queries.guard.spec.ts`
  - Still failing, unrelated to this workstream: `pnpm lint:changed` on import ordering in `src/app/api/v1/plans/[planId]/retry/route.ts`, `src/app/api/v1/plans/stream/route.ts`, and `src/hooks/useStreamingPlanGeneration.ts`
  - Still failing, unrelated to this workstream: `pnpm type-check` on `tests/unit/helpers/smoke/mode-config.spec.ts` because a `ProcessEnv` fixture is missing required `NODE_ENV`
- 2026-04-05: Follow-up cleanup after self-review is complete for the plan-read-models slice:
  - Fixed the accidental duplicate lightweight summary declarations/export in `src/features/plans/read-models/summary.ts`.
  - Re-ran the full scoped validation set above and confirmed it remains green after the fix.
  - Final review pass on the touched slice found no additional scoped defects; remaining lint/type-check failures are still unrelated worktree issues outside this task.
- 2026-04-05: Remaining unchecked implementation items are now closed out for this slice:
  - Removed the last legacy `src/features/plans/detail-mapper.ts` shim after updating remaining tests to import canonical detail read-model exports directly.
  - Replaced the regex-based ownership guard with a compile-time contract test in `tests/integration/db/plans.queries.guard.spec.ts` that proves plan/module read queries require `userId` arguments.
  - Tightened `src/app/plans/[id]/helpers.ts` so optimistic status maps layer on top of canonical `completedTasks` instead of re-counting stray status entries as source of truth.
  - Additional focused validation passed: `tests/unit/app/plans/helpers.spec.ts`, `tests/unit/mappers/detailToClient.spec.ts`, `tests/unit/mappers/derivation.spec.ts`, `tests/integration/db/plans.queries.guard.spec.ts`, and `pnpm test:changed`.
  - Validation status is unchanged outside this slice: `pnpm lint:changed` still fails only on unrelated import ordering in `src/app/api/v1/plans/[planId]/retry/route.ts`, `src/app/api/v1/plans/stream/route.ts`, and `src/hooks/useStreamingPlanGeneration.ts`; `pnpm type-check` still fails only on `tests/unit/helpers/smoke/mode-config.spec.ts` missing `NODE_ENV` in a `ProcessEnv` fixture.
- 2026-04-05: Self-review cleanup pass completed for the remaining plan-read-models findings:
  - Moved `totalMinutes`, `completedMinutes`, and `completedModules` into the canonical `LearningPlanDetail` builder so `toClientPlanDetail()` no longer recomputes them.
  - Removed the last transitional seams by deleting `src/lib/db/queries/mappers.ts`, deleting the thin `src/features/plans/read-models/module-detail.ts`, and updating callers/tests to import canonical read-model builders directly.
  - Simplified the query guard to a direct type-contract assertion that keeps the required `userId` boundary without executing invalid runtime queries.
  - Tightened the overview helper/module-completion fallback and fixed `getNextTaskName()` so completed summaries no longer show misleading `Next:` copy.
  - Final scoped validation passed: `pnpm lint:changed`, `pnpm type-check`, `./scripts/test-unit.sh tests/unit/app/plans/helpers.spec.ts`, `./scripts/test-unit.sh tests/unit/mappers/planQueries.spec.ts`, `./scripts/test-unit.sh tests/unit/plans/summary-boundaries.spec.ts`, and `./scripts/test-integration.sh tests/integration/db/plans.queries.guard.spec.ts`.
