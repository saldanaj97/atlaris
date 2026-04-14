# Slice C — Plan read-model consolidation plan

## Step C.0 - Confirm scope / ACs from prelim-plan + prelim-research

### Slice goal

Finish consolidating plan reads behind one feature-owned boundary, using the status/read-model/read-service primitives already landed on the current branch, so detail, status, and summary/list semantics are consistent before Slice D and Slice E build on them.

### Acceptance criteria

- A single feature-owned read facade/service is the implementation entrypoint for plan detail + status reads, remains the destination for list/summary reads introduced by Slice B, and any remaining read consumers are either migrated or explicitly scoped out.
- `src/features/plans/read-models/detail.ts` no longer mixes detail aggregation, status derivation, and client DTO mapping in one module; any remaining barrel is intentionally thin or removed.
- Summary/list and detail/status paths share one explicit status contract instead of deriving meanings independently from raw DB state.
- Detail API, status API, and plan page reads use facade outputs directly without double-mapping the same detail payload.
- UI-only status overlays (`paused`, staleness wording) remain outside the canonical read service; presentation helpers that already operate on fetched summaries can keep consuming canonical summary status directly.
- Transitional wrappers/barrels are removed or intentionally justified, and the status meanings needed by Slice E are explicit and stable enough to treat as a dependency.

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

- **Current branch state:** initial Slice C scaffolding already exists in `src/features/plans/read-service/plan-read-service.ts`, `src/features/plans/status/read-status.ts`, and the split detail read-model files. Finish and tighten these seams instead of recreating them.
- **Depends on Slice A:** reuse shared completion-metrics extraction instead of rebuilding metrics inside new read modules.
- **Depends on Slice B:** extend the read-facade destination created there (`src/features/plans/read-service/` per research) instead of inventing a parallel facade path.
- **Coordinate with Slice E:** publish and preserve the `PlanReadStatus` meanings above; Slice E should treat these as the backend contract for pending/processing/ready/failed behavior.
- **Shared files / likely overlap:**
  - Slice A: `src/features/plans/read-models/detail.ts`, `src/features/plans/read-models/summary.ts`, `src/app/plans/components/plan-utils.ts`
  - Slice B: plan read facade files and app consumers
  - Slice E: pending-state/detail-status consumers

## Step C.1 - Lock parity coverage before moving boundaries

1. Audit the current coverage first, then extend only where parity gaps remain before cleanup/refactoring:
   - `tests/unit/api/plan-status.spec.ts`
   - `tests/unit/plans/summary-boundaries.spec.ts`
   - `tests/integration/db/plans.queries.spec.ts`
   - `tests/integration/contract/plans.get.spec.ts`
   - `tests/integration/contract/plans.status-parity.spec.ts`
2. Keep explicit fixtures for the currently ambiguous shapes, adding only the missing cases:
   - `generationStatus='ready'` + no modules + attempts below cap
   - `generationStatus='ready'` + no modules + attempts at cap
   - `generationStatus='generating'` + modules present
   - `generationStatus='failed'` + modules present
3. Lock the intended conversion rules in tests before any cleanup that could collapse layers or hide drift:
   - detail/status endpoints agree on `PlanReadStatus`
   - summary/list surfaces never report `active` for a plan that canonical detail/status would still consider `pending` or `processing`
   - page/API detail payloads preserve ordering, default values, and attempt projections
4. If Slice A has already landed `computeCompletionMetrics()`, assert behavioral parity through unchanged totals/completion values rather than re-testing implementation details or duplicating coverage that already exists.

## Step C.2 - Finalize the canonical status boundary

1. Use the existing feature-owned status module (`src/features/plans/status/read-status.ts`) as the single home for:
   - `PlanReadStatus`
   - `derivePlanReadStatus(...)`
   - `derivePlanSummaryStatus(...)` or similarly named conversion helper
   - small input types describing the minimum raw data needed (`generationStatus`, `hasModules`, `attemptsCount`, `attemptCap`, `completion`)
2. Move remaining imports off `src/features/plans/status.ts`; if only compatibility/test imports remain, delete the wrapper in this slice instead of carrying it forward.
3. Verify `src/features/plans/read-models/summary.ts` and status snapshots derive from the canonical read boundary instead of directly branching on raw `generationStatus`.
4. Keep route/UI presentation concerns out of the status boundary:
   - `classificationToUserMessage()` stays a presentation helper
   - paused/staleness logic stays in `plan-utils.ts`
5. Tighten naming and comments/JSDoc so future slices can tell the difference between DB lifecycle, read lifecycle, and UI overlays without reintroducing a second status layer.

## Step C.3 - Finalize split detail read-model responsibilities

1. Keep the current focused module split as the named destination for each responsibility while preserving behavior:
   - `detail-aggregate.ts` — nested module/task/resource/progress assembly and metrics wiring
   - `detail-status.ts` — status snapshot building from canonical read status
   - `detail-dto.ts` — `ClientPlanDetail` / attempt mapping and anomaly logging
2. Keep `detail.ts` only as a temporary barrel while active consumers are still moving; remove it in this slice if no meaningful consumer still needs the compatibility layer.
3. Preserve current semantics while splitting:
   - module/task/resource sorting by `order`
   - fallback defaults such as `estimatedMinutes ?? 0` and `task.progress?.status ?? 'not_started'`
   - warning logs for unknown attempt status/classification
   - latest-attempt metadata extraction (`metadata.provider.model`)
4. Verify detail aggregation uses the Slice A completion helper rather than re-encoding reducers or leaving duplicate metric math behind.

## Step C.4 - Finalize the single plan read facade/service

1. Use the existing Slice B read-facade destination (`src/features/plans/read-service/plan-read-service.ts`) as the canonical plan read entrypoint; do not introduce another facade/service name for the same seam.
2. Give the facade clearly named methods for the three read use-cases in scope:
   - detail read for page/API consumers
   - status read for polling/contract consumers
   - summary/list read path that reuses the same status conversion rules
3. Keep `src/lib/db/queries/plans.ts` focused on row fetching, ownership checks, and low-level query helpers. Do not let it remain a second orchestration layer.
4. For list reads, unify semantics rather than necessarily rewriting every query shape:
   - keep lightweight SQL aggregation where it is cheaper
   - but run the resulting summary rows through the same canonical status conversion layer used by detail/status reads
5. Decide whether `listDashboardPlanSummaries` and `listPlansPageSummaries` stay as separate public entries for caller clarity or collapse behind one shared internal helper; do not preserve copy-paste that implies different semantics when there are none.
6. If the facade needs temporary adapters for existing callers, keep them feature-owned and clearly mark them transitional so Slice D/E do not depend on query-module orchestration again.

## Step C.5 - Move app consumers onto the facade and remove duplicate mapping

1. Verify the detail/status API routes consume facade outputs directly and do not regress back to query-module orchestration:
   - `src/app/api/v1/plans/[planId]/route.ts`
   - `src/app/api/v1/plans/[planId]/status/route.ts`
2. Verify server-page reads stay on the facade:
   - `src/app/plans/[id]/actions.ts`
   - `src/app/plans/[id]/components/PlanDetailContent.tsx`
3. Remove any remaining double-mapping path where both the server action and page component effectively depend on `LearningPlanDetail -> ClientPlanDetail` transforms.
4. Keep the page-facing action returning the already shaped detail payload the component actually needs, and keep `PlanAccessResult` helpers/types aligned with that boundary.
5. Audit remaining read consumers that still bypass the seam, especially:
   - `src/app/api/v1/plans/[planId]/attempts/route.ts`
   - any leftover direct `@/lib/db/queries/plans` imports used only for plan-read orchestration
   Either migrate them in this slice or explicitly leave them out of scope with a documented reason.
6. Keep summary consumers on the canonical status layer without forcing already-fetched presentation helpers through the read service:
   - `src/app/plans/components/plan-utils.ts`
   - `src/app/dashboard/components/activity-utils.ts`
7. Keep UI-only polish separate:
   - `plan-utils.ts` may still convert canonical summary `active` to `paused`
   - dashboard/activity ranking can still prioritize `active` over `generating`, but it should consume the canonical summary status instead of re-deriving from raw plan fields

## Step C.6 - Clean up transitional wrappers and document cross-slice expectations

1. Once consumers are moved or explicitly scoped out, remove or minimize transitional wrappers/barrels that only preserve the old orchestration split.
2. Verify the final import graph matches Slice B’s intended ownership:
   - app/routes/pages import the feature read facade
   - feature read facade imports query helpers + read-model helpers
   - DB query modules no longer import feature-layer DTO mappers for orchestration
   - any remaining direct query imports are limited to intentionally out-of-scope or write-oriented flows
3. Leave a short implementation note in code comments only where ambiguity is easy to reintroduce:
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

If new focused specs are added for wrapper cleanup, remaining consumer migration, or facade/status helpers, run those explicitly before the broader commands.

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
   - Fill any remaining unit + integration gaps for ambiguous status cases, detail/status parity, and seam regressions.
2. `refactor: finalize canonical plan read boundary`
   - Tighten the existing status/read-model/read-service seam and remove redundant wrappers.
3. `refactor: finish routing plan reads through facade`
   - Migrate or scope remaining read consumers, remove duplicate detail mapping, and clean up transitional barrels.

## Open decisions to resolve before coding

- **Attempts-route scope:** migrate `src/app/api/v1/plans/[planId]/attempts/route.ts` onto the same feature-owned seam in this slice, or explicitly leave it for a later slice if it blocks on write/lifecycle work.
- **List-facade duplication:** keep `listDashboardPlanSummaries` and `listPlansPageSummaries` as separate public entries for caller clarity, or collapse them behind one shared internal helper to avoid semantic drift.
- **Barrel cleanup threshold:** delete `src/features/plans/status.ts` and/or `src/features/plans/read-models/detail.ts` once only compatibility imports remain; do not keep them by default.
