# Plan: Plan Read Models Deepening

## Goal

Create an implementation-ready phase-one plan that deepens plan-facing read models without turning the effort into a generic page-state rewrite. The target is a small set of explicit plan-centric read boundaries that serve the core `/plans` and dashboard surfaces, while leaving billing and schedule composition out of the first pass.

## Resolved Phase-One Decisions

- Phase one covers:
  - `/plans` list
  - `/plans/[id]` detail
  - `/plans/[id]/modules/[moduleId]` detail
  - dashboard consumers of plan summaries
  - plan list/detail/attempts/status APIs where they share the same underlying read-model work
- Phase one does **not** cover:
  - billing/settings composition
  - schedule loading and schedule DTOs
  - a generic screen-data composition framework
- Pages are the primary target. APIs are secondary adapters over the same read-model work where possible.
- Module detail is in scope now. Deferring it would preserve the current split-brain between plan detail and module detail.
- The target access contract is **explicit ownership input** for plan-facing reads. Do not keep the current split where plan detail requires `userId` but module detail leans on ambient authenticated DB context.
- The target design should remove layers, not add one more mapper sandwich. Thin forwarding loaders and redundant page-access wrappers are candidates for collapse.
- Dashboard-specific interpretation such as activity-feed generation can stay page-local in phase one, but plan status/next-step semantics should not stay scattered across unrelated UI helpers.
- API DTOs and page/server DTOs do not need to be fully unified in phase one, but both should derive from the same canonical internal read models instead of each building their own truth.

## Step 1.0 — Confirm accepted scope and canonical targets

- Reconfirm the accepted phase-one boundaries against the research artifact:
  - list track: plans page, dashboard summary consumers, list API
  - detail track: plan detail, module detail, detail API, attempts API, status API
- Record the explicit exclusions:
  - billing/settings composition
  - schedule data and schedule page contracts
  - generalized page-state orchestration
- Output:
  - a final scope note in the planning artifacts
  - todos updated to reflect that scope lock is complete

## Step 1.1 — Define the canonical read-model families

- Split the implementation plan into two read-model families:
  - **Plan Summary Read Models**
    - primary consumers: [PlansContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/PlansContent.tsx), [DashboardContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/DashboardContent.tsx), [src/app/api/v1/plans/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/route.ts)
    - current source cluster: [src/lib/db/queries/plans.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/plans.ts), [src/lib/db/queries/mappers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/mappers.ts), [src/app/plans/components/plan-utils.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/plan-utils.ts), [src/app/dashboard/components/activity-utils.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/activity-utils.ts)
  - **Plan Detail Read Models**
    - primary consumers: [src/app/plans/[id]/components/PlanDetailContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/components/PlanDetailContent.tsx), [src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx), [src/app/api/v1/plans/[planId]/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/route.ts), [src/app/api/v1/plans/[planId]/attempts/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/attempts/route.ts), [src/app/api/v1/plans/[planId]/status/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/status/route.ts)
    - current source cluster: [src/lib/db/queries/plans.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/plans.ts), [src/lib/db/queries/modules.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/modules.ts), [src/features/plans/detail-mapper.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/detail-mapper.ts), [src/app/plans/[id]/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/helpers.ts)
- Do not force both families into one service/module unless the interface naturally stays small.
- Output:
  - canonical family definitions and current consumers

## Step 1.2 — Normalize the access contract before moving shapes

- Adopt **explicit ownership input** as the phase-one contract for plan-facing reads.
- Concretely:
  - preserve the security posture already enforced by [tests/integration/db/plans.queries.guard.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/db/plans.queries.guard.spec.ts)
  - bring module detail into the same contract family instead of leaving it ambient-RLS-only as in [src/lib/db/queries/modules.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/modules.ts)
- **Module detail migration target:** add `userId` to `getModuleDetail` signature and add an explicit `learningPlans.userId = userId` predicate in the query WHERE clause, matching the pattern in `plans.ts`. The module query already joins to `learningPlans`; this makes the ownership check explicit instead of ambient. Ambient RLS stays as defense-in-depth but is no longer the public contract.
- Planning target:
  - list/detail read-model loaders should accept explicit ownership context
  - page and API adapters should supply that context from auth wrappers
  - request-scoped DB usage can remain an implementation detail, not the public contract
- **Security note:** once `modules.ts` gains `userId`, the guard test replacement (Step 1.6) must cover both `plans.ts` and `modules.ts`.
- Output:
  - one explicit contract note for both read-model families
  - a migration note for module detail with the concrete signature change

## Step 1.3 — Remove fake seams and define what survives

- **DELETE** — collapse or remove the layers that are only structural noise:
  - [src/app/plans/[id]/data.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/data.ts) — components call actions directly
  - [src/app/plans/[id]/modules/[moduleId]/data.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/data.ts) — same
- **KEEP as thin page adapters** — re-evaluate page-access unions:
  - [getPlanForPage()](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/actions.ts) — converts auth context + planId to typed access result; stays
  - [getModuleForPage()](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/actions.ts) — same pattern for module; stays
  - Their responsibility is auth-to-read-model translation and page-error shaping, not data loading logic
- **ABSORB into canonical read models, then DELETE source** — layers with real semantics in dying files:
  - [src/features/plans/detail-mapper.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/detail-mapper.ts) currently encodes five real behaviors that must migrate:
    1. Plan status derivation via `derivePlanStatus()` from `@/features/plans/status`
    2. Attempt classification masking (security: success attempts hide classification)
    3. Sorting modules/tasks/resources by `order`
    4. Default filling for missing optional fields
    5. Anomaly logging for invalid attempt data
  - These semantics move INTO the canonical detail read model. The file dies ONLY after all five behaviors have new homes and matching tests.
  - `derivePlanStatus()` at `@/features/plans/status` is already a shared module consumed by both `detail-mapper.ts` and the status API route. It survives as-is or moves into the canonical detail model — but it must NOT be duplicated.
- **ABSORB into canonical read models** — mapping layers:
  - [src/lib/db/queries/mappers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/mappers.ts) aggregation logic (completion math, nesting, metric rollup) moves into canonical read-model builders. The file may survive with changed exports.
- **SPLIT** — page helpers:
  - [src/app/plans/[id]/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/helpers.ts): `planSuccess`/`planError`/`scheduleSuccess`/`scheduleError` and type guards stay with page-access actions. `computeOverviewStats`/`computeDetailsCardStats`/`getStatusesFromModules` stay page-local but consume canonical values instead of re-counting tasks.
- **KEEP page-local** — view derivation:
  - [src/app/plans/components/plan-utils.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/plan-utils.ts) — `getPlanStatus()` becomes a thin adapter over canonical summary status. `getNextTaskName()` stays page-local with its limitations documented.
  - [src/app/dashboard/components/activity-utils.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/activity-utils.ts) — dashboard-only derivation, no access control.
- Output:
  - a layer-retention matrix: keep, absorb+delete, delete, split, or keep page-local — with explicit semantic migration paths for each absorb target

## Step 1.4 — Plan Summary Read Models slice

### Step 1.4.0 — Confirm summary consumers and required semantics

- Inventory the exact data/behavior required by:
  - [PlansList.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/PlansList.tsx)
  - [PlanRow.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/PlanRow.tsx)
  - [ResumeLearningHero.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/ResumeLearningHero.tsx)
  - [ActivityStreamSidebar.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/ActivityStreamSidebar.tsx)
  - [src/app/api/v1/plans/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/route.ts)
- Call out lies and leakage in current helpers:
  - [getNextTaskName()](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/plan-utils.ts) does not actually know the next task — it falls back to the first module title
  - status logic is scattered across three places that compute different things:
    1. `plan-utils.ts: getPlanStatus()` — uses `generationStatus + completion + staleness`
    2. `detail-mapper.ts: derivePlanStatus()` — uses `generationStatus + hasModules + attemptCount + ATTEMPT_CAP`
    3. `activity-utils.ts: generateActivities()` — implicitly checks `completion` and `generationStatus`
  - these are not the same computation; they must not be treated as equivalent during consolidation

### Step 1.4.1 — Define the canonical summary model

- Introduce one canonical summary read model for plan-centric list consumers.
- It should own:
  - plan identity and metadata needed by list/dashboard consumers
  - progress and completion metrics
  - **stable summary status**: one canonical status derivation for summaries, based on `generationStatus + completion`. This becomes the single source; page utilities adapt from it.
- It should **not** own:
  - staleness-based UI display status — that stays in `plan-utils.ts: getPlanStatus()` as a thin adapter over canonical summary status
  - dashboard-only activity feed rendering language — stays in `activity-utils.ts`
  - billing/usage composition — stays in `getUsageSummary()`
- **`getNextTaskName()` disposition:** keep the current lie as page-local in phase one. Fixing it would require loading task-level progress data into summaries, which is scope creep. Add a code comment documenting the limitation. Revisit in a later phase if consumers genuinely need next-task accuracy.

### Step 1.4.2 — Define secondary adapters

- Keep a secondary lightweight list API adapter if transport minimization still matters.
- That adapter should derive from the canonical summary model instead of a separate query/mapping pipeline.
- **OpenAPI blast radius:** the `LightweightPlanSummary` schema in [src/lib/api/openapi.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/api/openapi.ts) must update in the same commit if the list API response shape changes. This is a concrete validation step, not just a note.

### Step 1.4.3 — TDD and validation planning

- Write boundary tests for summary read behavior before implementation:
  - canonical summary status is consistent across list and dashboard consumers
  - `getPlanStatus()` page adapter adds staleness on top of canonical status, not its own derivation
  - lightweight API output is derived from the canonical summary source
  - OpenAPI schema matches the actual list API response shape
- Replace or delete seam tests that only protect current mapper/file structure.

## Step 1.5 — Plan Detail Read Models slice

### Step 1.5.0 — Confirm detail consumers and exclusions

- Include:
  - [PlanDetailContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/components/PlanDetailContent.tsx)
  - [ModuleDetailContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx)
  - detail API in [src/app/api/v1/plans/[planId]/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/route.ts)
  - attempts API in [src/app/api/v1/plans/[planId]/attempts/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/attempts/route.ts)
  - **status API in [src/app/api/v1/plans/[planId]/status/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/status/route.ts)** — this route derives plan status via `derivePlanStatus()` through a separate code path with separate DB queries. If the canonical detail model owns status derivation, this route must consume from it instead of re-querying modules + attempts independently.
- Exclude:
  - schedule loading in [getPlanScheduleForPage()](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/actions.ts)
  - schedule DTOs and schedule UI contracts

### Step 1.5.1 — Define the canonical detail models

- Create one canonical plan-detail model family and one module-detail model family.
- Keep them related, not artificially merged:
  - plan detail owns modules/tasks/resources/attempt summary for the plan page
  - module detail owns navigation context and task/resource/progress for the module page
- Both families should share the same explicit-ownership contract.
- **Module detail defensive contracts:** module detail currently has no `mapDetailToClient` equivalent. The canonical module-detail model must apply the same defensive contracts as plan detail: sorting by `order`, default filling for optional fields, and anomaly handling. Do not leave module detail as raw query output while plan detail gets full normalization.

### Step 1.5.2 — Decide where derivation lives

- **Canonical detail models own:**
  - `totalTasks`, `completedTasks`, module completion — computed once from DB rows, not re-derived
  - stable plan status derivation (via `derivePlanStatus()` or its replacement)
  - attempt serialization rules including classification masking (security: success attempts hide classification)
  - sorting by `order`, default filling, anomaly logging (currently in `detail-mapper.ts`)
- **Page helpers consume canonical values, they do not re-count:**
  - `computeOverviewStats()` and `computeDetailsCardStats()` in [helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/helpers.ts) currently re-derive `totalTasks`/`completedTasks` from already-computed `ClientPlanDetail`. After the refactor, they should format/recombine canonical values for UI cards, not re-count tasks.
  - `getStatusesFromModules()` stays page-local as a UI view helper.
- **Keep presentation-local formatting above the boundary:**
  - badge copy, display strings, dashboard-only narrative items

### Step 1.5.3 — Rationalize page/API adapters

- Pages and APIs should become thin adapters:
  - auth and route params in
  - canonical read model out
  - transport-specific error/redirect handling around it
- Do not preserve [detail-mapper.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/detail-mapper.ts) as a second source of truth. Its five behaviors (Step 1.3) must have migrated into canonical models before it is deleted.
- **Status API route adapter:** the status route should call a lightweight status accessor on the canonical detail model (e.g., `getPlanStatus(planId, userId)`) rather than re-querying modules and attempts independently. This prevents status-derivation drift between the detail page and the polling endpoint.

### Step 1.5.4 — TDD and validation planning

- Write boundary tests for:
  - authorized plan detail access with correct `totalTasks`/`completedTasks` (not re-derived)
  - authorized module detail access with sorting and defaults applied
  - attempts payload derivation including classification masking
  - canonical status derivation consistent across detail page, detail API, and status API
  - status API returns same status as detail model for identical plan state
- Replace seam tests that only prove forwarding behavior of loaders.

## Step 1.6 — Test migration strategy

- Replace low-value seam tests with boundary tests.
- **Expected DELETE candidates:**
  - [tests/unit/app/plans/[id]/data.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/plans/[id]/data.spec.ts) — forwarding wrapper, proves call delegation only
  - [tests/unit/app/plans/[id]/modules/[moduleId]/data.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/app/plans/[id]/modules/[moduleId]/data.spec.ts) — same
- **Expected KEEP candidates:**
  - [tests/unit/mappers/planQueries.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/mappers/planQueries.spec.ts) — real aggregation logic (completion math, nesting)
  - [tests/unit/mappers/detailToClient.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/mappers/detailToClient.spec.ts) — real client contract: classification masking, status derivation, sorting, defaults
  - [tests/unit/mappers/derivation.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/mappers/derivation.spec.ts) — status derivation semantics through `mapDetailToClient` (pending/ready/failed states)
  - [tests/integration/db/plans.queries.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/db/plans.queries.spec.ts) — tenant isolation (owner gets data, cross-tenant returns null, pagination validation)
  - [tests/integration/db/modules.queries.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/db/modules.queries.spec.ts) — module data contracts (task inclusion, ordering, metadata)
- **Expected REPLACE candidate:**
  - [tests/integration/db/plans.queries.guard.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/db/plans.queries.guard.spec.ts) — real security intent (all plan queries must have userId) but regex-on-source implementation. **Concrete replacement:** a behavioral integration test that calls every plan-and-module read query without a `userId` param and asserts rejection (compile error via required param, or runtime null/error). Must cover both `plans.ts` and `modules.ts` once modules gain `userId`.
- **Expected EXPAND candidate:**
  - [tests/integration/db/modules.queries.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/db/modules.queries.spec.ts) — once `getModuleDetail` gains `userId`, add tenant-isolation assertions matching the pattern in `plans.queries.spec.ts`: cross-tenant access returns null, missing module returns null.
- **Expected new boundary tests:**
  - summary-model boundary tests: canonical shapes, consistent status across consumers
  - detail-model boundary tests: canonical shapes with sorting/defaults applied, status consistent across detail page + detail API + status API
  - classification masking test: success attempts never expose classification in any consumer path
  - thin adapter tests for page/API translation only (auth → read model → response shaping)

## Step 1.7 — File-change plan

### Likely primary files to change

- [src/lib/db/queries/plans.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/plans.ts)
- [src/lib/db/queries/modules.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/modules.ts)
- [src/lib/db/queries/mappers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/lib/db/queries/mappers.ts)
- [src/features/plans/detail-mapper.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/detail-mapper.ts)
- [src/features/plans/status.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/plans/status.ts)
- [src/app/plans/components/PlansContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/PlansContent.tsx)
- [src/app/plans/components/plan-utils.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/plan-utils.ts)
- [src/app/dashboard/components/DashboardContent.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/DashboardContent.tsx)
- [src/app/dashboard/components/activity-utils.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/dashboard/components/activity-utils.ts)
- [src/app/plans/[id]/actions.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/actions.ts)
- [src/app/plans/[id]/helpers.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/helpers.ts)
- [src/app/plans/[id]/modules/[moduleId]/actions.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/actions.ts)
- [src/app/api/v1/plans/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/route.ts)
- [src/app/api/v1/plans/[planId]/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/route.ts)
- [src/app/api/v1/plans/[planId]/attempts/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/attempts/route.ts)
- [src/app/api/v1/plans/[planId]/status/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/[planId]/status/route.ts)

### Likely files to delete or collapse

- [src/app/plans/[id]/data.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/data.ts)
- [src/app/plans/[id]/modules/[moduleId]/data.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/[id]/modules/[moduleId]/data.ts)

### Likely new files

- `src/features/plans/read-models/summary.ts`
- `src/features/plans/read-models/detail.ts`
- `src/features/plans/read-models/module-detail.ts`
- `src/features/plans/read-models/types.ts`
- `src/features/plans/read-models/adapters/` for thin page/API adapters only if needed

These filenames are planning placeholders. During implementation, prefer the smallest structure that actually deepens the boundary.

## Validation Steps

- Verify each phase-one decision is reflected in the implementation slices:
  - pages primary
  - APIs secondary adapters
  - module detail included
  - schedule excluded
  - billing excluded
  - explicit ownership contract adopted
  - status API route included in detail-family
- Verify the plan removes at least one current seam layer rather than adding another. Concrete minimum: `data.ts` x2 deleted and `detail-mapper.ts` absorbed.
- Verify `detail-mapper.ts` five behaviors (status derivation, classification masking, sorting, defaults, anomaly logging) each have a named destination before the file is deleted.
- Verify `derivePlanStatus()` is consumed, not duplicated, by both the canonical detail model and the status API route.
- Verify the summary and detail tracks are independently implementable with low merge conflict.
- Verify OpenAPI `LightweightPlanSummary` schema update is a concrete step, not a footnote, for any list API shape change.
- Verify the test migration plan keeps security/tenant-isolation coverage intact:
  - guard replacement covers both `plans.ts` and `modules.ts`
  - module tenant-isolation tests are expanded
  - classification masking tests survive
- Verify future implementation uses scoped commands only, with `pnpm test:changed` for affected tests.

## Issue Verification and Closure

- Walk through [todos.md](/Users/juansaldana/Dev/Projects/atlaris/.plans/plan-read-models/todos.md) and mark the planning decisions complete once the artifacts reflect them.
- Confirm the final planning package answers:
  - what phase one covers
  - what it excludes
  - what the canonical read-model families are
  - what the access contract is
  - what gets deleted versus retained
  - how tests migrate
- Only move to implementation after the planning artifacts still read as small, explicit boundaries instead of another abstract “cleanup” essay.
