# Slice C — Plan read-model consolidation plan

## Step C.0 - Confirm scope / ACs from prelim-plan + prelim-research

### Slice goal

Create one feature-owned plan read boundary that makes plan detail, status, and summary/list semantics consistent before Slice D and Slice E build on them.

### Acceptance criteria

- A single feature-owned read facade/service is the implementation entrypoint for plan detail + status reads, and is the destination for list/summary reads introduced by Slice B.
- `src/features/plans/read-models/detail.ts` no longer mixes detail aggregation, status derivation, and client DTO mapping in one module.
- Summary/list and detail/status paths share one explicit status contract instead of deriving meanings independently from raw DB state.
- Detail API, status API, and plan page reads stop double-mapping the same detail payload.
- UI-only status overlays (`paused`, staleness wording) remain outside the canonical read service.
- The status meanings needed by Slice E are explicit and stable enough to treat as a dependency.

### Status-boundary decisions to lock before implementation

- Preserve **three named status layers** instead of collapsing everything into one enum:
  1. **`GenerationStatus` (DB lifecycle)** — raw persisted values such as `generating`, `pending_retry`, `ready`, `failed`; Slice C consumes this but does not redefine it.
  2. **`PlanReadStatus` (canonical read boundary)** — `pending | processing | ready | failed`; this is the single source for detail/status consumers and for summary-status conversion.
  3. **`PlanSummaryStatus` (progress/list semantics)** — `generating | failed | active | completed`; derived from `PlanReadStatus` plus completion metrics, not from raw `generationStatus` directly.
- `paused` remains a **UI-only overlay** in `src/app/plans/components/plan-utils.ts`, applied only when canonical summary status is `active` and the plan is stale.
- `hasModules === true` remains the ground-truth success signal for `PlanReadStatus`; if modules exist, the read status is `ready` even when stale DB lifecycle fields lag behind.
- `generationStatus === 'ready'` with **no modules** is treated as a transitional/anomalous read state, not success:
  - below attempt cap => `pending`
  - at/above attempt cap => `failed`
- Summary/list mapping must follow the canonical read status:
  - `pending | processing` => summary `generating`
  - `failed` => summary `failed`
  - `ready` + completion `< 1` => summary `active`
  - `ready` + completion `>= 1` => summary `completed`
- Keep the public API response shapes stable for this slice unless a contract test is intentionally updated. Prefer changing internals first, not response JSON.

### Dependencies and coordination

- **Depends on Slice A:** reuse shared completion-metrics extraction instead of rebuilding metrics inside new read modules.
- **Depends on Slice B:** extend the read-facade destination created there (`src/features/plans/read-service/` per research) instead of inventing a parallel facade path.
- **Coordinate with Slice E:** publish and preserve the `PlanReadStatus` meanings above; Slice E should treat these as the backend contract for pending/processing/ready/failed behavior.
- **Shared files / likely overlap:**
  - Slice A: `src/features/plans/read-models/detail.ts`, `src/features/plans/read-models/summary.ts`, `src/app/plans/components/plan-utils.ts`
  - Slice B: plan read facade files and app consumers
  - Slice E: pending-state/detail-status consumers

## Step C.1 - Lock parity coverage before moving boundaries

1. Extend existing tests before refactoring code paths:
   - `tests/unit/api/plan-status.spec.ts`
   - `tests/unit/plans/summary-boundaries.spec.ts`
   - `tests/integration/db/plans.queries.spec.ts`
   - `tests/integration/contract/plans.get.spec.ts`
   - `tests/integration/contract/plans.status-parity.spec.ts`
2. Add explicit fixtures for the currently ambiguous shapes:
   - `generationStatus='ready'` + no modules + attempts below cap
   - `generationStatus='ready'` + no modules + attempts at cap
   - `generationStatus='generating'` + modules present
   - `generationStatus='failed'` + modules present
3. Lock the intended conversion rules in tests before implementation:
   - detail/status endpoints agree on `PlanReadStatus`
   - summary/list surfaces never report `active` for a plan that canonical detail/status would still consider `pending` or `processing`
   - page/API detail payloads preserve ordering, default values, and attempt projections
4. If Slice A has already landed `computeCompletionMetrics()`, update tests to assert reuse indirectly through unchanged totals/completion values rather than re-testing implementation details.

## Step C.2 - Introduce the canonical status boundary

1. Add a feature-owned status module (research target: `src/features/plans/status/read-status.ts`) that owns:
   - `PlanReadStatus`
   - `derivePlanReadStatus(...)`
   - `derivePlanSummaryStatus(...)` or similarly named conversion helper
   - small input types describing the minimum raw data needed (`generationStatus`, `hasModules`, `attemptsCount`, `attemptCap`, `completion`)
2. Re-home current `derivePlanStatus()` logic from `src/features/plans/status.ts` into that module, then keep `src/features/plans/status.ts` only as a compatibility barrel/wrapper until all imports move.
3. Update `src/features/plans/read-models/summary.ts` so summary status derives from the canonical read boundary instead of directly branching on raw `generationStatus`.
4. Keep route/UI presentation concerns out of the status boundary:
   - `classificationToUserMessage()` stays a presentation helper
   - paused/staleness logic stays in `plan-utils.ts`
5. Make the naming explicit in code comments/JSDoc so future slices can tell the difference between DB lifecycle, read lifecycle, and UI overlays.

## Step C.3 - Split detail read-model responsibilities

1. Break `src/features/plans/read-models/detail.ts` into focused modules while preserving behavior:
   - `detail-aggregate.ts` — nested module/task/resource/progress assembly and metrics wiring
   - `detail-status.ts` — status snapshot building from canonical read status
   - `detail-dto.ts` — `ClientPlanDetail` / attempt mapping and anomaly logging
2. Keep a thin compatibility barrel (`detail.ts`) during migration if that reduces churn; delete or slim it only after consumers switch.
3. Preserve current semantics while splitting:
   - module/task/resource sorting by `order`
   - fallback defaults such as `estimatedMinutes ?? 0` and `task.progress?.status ?? 'not_started'`
   - warning logs for unknown attempt status/classification
   - latest-attempt metadata extraction (`metadata.provider.model`)
4. Replace duplicated metric math in detail aggregation with the Slice A completion helper rather than re-encoding reducers here.

## Step C.4 - Implement the single plan read facade/service

1. Extend the Slice B read-facade destination (`src/features/plans/read-service/plan-read-service.ts` per research) so it becomes the canonical plan read entrypoint.
2. Give the facade clearly named methods for the three read use-cases in scope:
   - detail read for page/API consumers
   - status read for polling/contract consumers
   - summary/list read path that reuses the same status conversion rules
3. Keep `src/lib/db/queries/plans.ts` focused on row fetching, ownership checks, and low-level query helpers. Do not let it remain a second orchestration layer.
4. For list reads, unify semantics rather than necessarily rewriting every query shape:
   - keep lightweight SQL aggregation where it is cheaper
   - but run the resulting summary rows through the same canonical status conversion layer used by detail/status reads
5. If the facade needs temporary adapters for existing callers, keep them feature-owned and clearly mark them transitional so Slice D/E do not depend on query-module orchestration again.

## Step C.5 - Move app consumers onto the facade and remove duplicate mapping

1. Migrate the detail/status API routes to consume facade outputs directly:
   - `src/app/api/v1/plans/[planId]/route.ts`
   - `src/app/api/v1/plans/[planId]/status/route.ts`
2. Migrate server-page reads to the facade:
   - `src/app/plans/[id]/actions.ts`
   - `src/app/plans/[id]/components/PlanDetailContent.tsx`
3. Remove the current double-mapping path where both the server action and page component effectively depend on `LearningPlanDetail -> ClientPlanDetail` transforms.
4. Preferred direction: make the page-facing action return the already shaped detail payload the component actually needs, then update `PlanAccessResult` helpers/types accordingly.
5. Rebase summary consumers on the canonical status layer:
   - `src/app/plans/components/plan-utils.ts`
   - `src/app/dashboard/components/activity-utils.ts`
6. Keep UI-only polish separate:
   - `plan-utils.ts` may still convert canonical summary `active` to `paused`
   - dashboard/activity ranking can still prioritize `active` over `generating`, but it should consume the canonical summary status instead of re-deriving from raw plan fields

## Step C.6 - Clean up transitional wrappers and document cross-slice expectations

1. Once consumers are moved, remove or minimize transitional wrappers that only preserve the old orchestration split.
2. Verify the final import graph matches Slice B’s intended ownership:
   - app/routes/pages import the feature read facade
   - feature read facade imports query helpers + read-model helpers
   - DB query modules no longer import feature-layer DTO mappers for orchestration
3. Leave a short implementation note in code comments where ambiguity is easy to reintroduce:
   - why `ready` without modules is not treated as success
   - why `paused` is intentionally excluded from the canonical read boundary
4. Do **not** expand scope into Slice D/E concerns (stream events, retry orchestration, client controller extraction).

## Validation Steps

Run focused checks first, then repo baselines:

- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/api/plan-status.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/plans/summary-boundaries.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts integration tests/integration/db/plans.queries.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts integration tests/integration/contract/plans.get.spec.ts`
- `pnpm exec tsx scripts/tests/run.ts integration tests/integration/contract/plans.status-parity.spec.ts`
- `pnpm test:changed`
- `pnpm check:full`

If new focused specs are added for the facade/status helpers, run those explicitly before the broader commands.

## Verification / Closure

- **AC: single read boundary exists**
  - Prove app detail/status/page consumers import from the feature read facade, not directly from `@/lib/db/queries/plans` for orchestration.
- **AC: detail aggregation/status/DTO mapping are split**
  - Prove dedicated modules exist for aggregation, status snapshot, and client DTO mapping, with `detail.ts` reduced to a barrel or removed.
- **AC: summary/detail semantics are unified**
  - Prove the canonical status helpers are shared and the `ready-without-modules` / attempt-cap edge cases produce matching detail + summary expectations in tests.
- **AC: duplicate detail mapping is removed**
  - Prove the page action/component path no longer remaps the same detail payload twice, and the detail API route returns facade-shaped data directly.
- **AC: UI-only overlays stay outside the domain boundary**
  - Prove `paused` still lives in `plan-utils.ts` and canonical read helpers do not emit it.
- **AC: Slice E contract is explicit**
  - Prove the canonical status module documents and tests `pending | processing | ready | failed`, including the anomalous `ready`/no-modules state.

## Likely commit split

1. `test: lock plan read/status parity`
   - Add/extend unit + integration coverage for ambiguous status cases and detail/status parity.
2. `refactor: add canonical plan read status helpers`
   - Introduce the explicit status boundary and rebase summary derivation onto it.
3. `refactor: split plan detail read-model`
   - Extract aggregation/status/DTO modules and reuse shared completion metrics.
4. `refactor: route plan consumers through read facade`
   - Move API/page/list consumers to the facade and remove duplicate detail mapping.

## Open decisions to resolve before coding

- **Facade naming:** if Slice B lands `PlanReadService`, keep that name; do not introduce a second `PlanDetailFacade` type unless it is just an alias/barrel.
- **Page action payload shape:** preferred outcome is `ClientPlanDetail` (or equivalent facade DTO) for page consumers, but confirm this does not conflict with any server-only consumers expecting raw `LearningPlanDetail`.
- **Status-route presentation boundary:** keep `latestClassification` inside the facade and `latestError` string shaping at the route layer unless another consumer needs the user-facing message too.
- **Query-module shrink strategy:** decide whether `src/lib/db/queries/plans.ts` becomes a pure helper host immediately in this slice or via a compatibility pass that lands with Slice B/C together.
