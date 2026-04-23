# Plan: Canonicalize plan read projection boundary

Issue: https://github.com/saldanaj97/atlaris/issues/310

## Summary

Issue 310 is a structural boundary task. The current read path spreads plan
projection semantics across DB query helpers, a read-service façade, pure
read-model builders, a generation-status helper, and app-level UI helpers.
Callers pick pieces from multiple layers, which makes "what is the canonical
truth for plan status/detail/attempts?" harder to answer than it should be.

The recommended end state is a single plan-domain read boundary that owns
observable plan projection semantics for shared app/API consumers:

- list summaries
- lightweight list summaries
- detail
- status snapshot
- attempt history
- summary display-status derivation used by app surfaces

This should be a behavior-preserving refactor. No schema changes. No billing
composition changes. No schedule generation changes. No response-shape changes
unless implementation proves a duplicated contract is impossible to preserve.

## Current State (validated against source)

- `src/features/plans/read-service/plan-read-service.ts` is the current façade.
  It exposes `listDashboardPlanSummaries`, `listPlansPageSummaries`,
  `listLightweightPlansForApi`, `getPlanDetailForRead`,
  `getPlanGenerationStatusSnapshot`, and `getPlanGenerationAttemptsForRead`.
- `src/lib/db/queries/plans.ts` owns row loading plus ownership checks for the
  plan list/detail/status/attempt queries. The functions already return
  boundary-friendly row bundles:
  `getPlanSummaryRowsForUser`, `getLightweightPlanSummaryRowsForUser`,
  `getLearningPlanDetailRows`, `getPlanStatusRowsForUser`,
  `getPlanAttemptsForUser`, `getPlanSummaryCount`.
- `src/features/plans/read-models/detail-aggregate.ts` builds nested plan
  detail and completion metrics from raw rows.
- `src/features/plans/read-models/detail-dto.ts` maps detail + attempts into
  client DTOs and also re-enters status logic by calling
  `buildPlanDetailStatusSnapshot`.
- `src/features/plans/read-models/detail-status.ts` computes the detail/status
  polling snapshot, including unknown-classification normalization.
- `src/features/plans/read-models/summary.ts` builds summary/lightweight
  projections and exports `deriveCanonicalPlanSummaryStatus`, which depends on
  `derivePlanReadStatus`.
- `src/features/plans/status/read-status.ts` is the canonical generation-read
  status helper today, but consumers do not stay at that layer. App helpers add
  more meaning above it.
- `src/app/plans/components/plan-utils.ts` imports
  `deriveCanonicalPlanSummaryStatus` from `read-models/summary.ts` and wraps it
  with a 30-day paused overlay, effectively adding a second app-level status
  layer on top of read-model truth.
- `src/app/dashboard/components/activity-utils.ts` separately derives
  active/generating ranking and milestone logic from summary rows.
- API consumers are split across:
  `src/app/api/v1/plans/route.ts`,
  `src/app/api/v1/plans/[planId]/route.ts`,
  `src/app/api/v1/plans/[planId]/status/route.ts`,
  `src/app/api/v1/plans/[planId]/attempts/route.ts`.
- App/page consumers are split across:
  `src/app/plans/components/PlansContent.tsx`,
  `src/app/dashboard/components/DashboardContent.tsx`,
  `src/app/plans/[id]/actions.ts`.
- Module detail is currently separate. `src/app/plans/[id]/modules/[moduleId]/actions.ts`
  reads through `src/lib/db/queries/modules.ts#getModuleDetail`, not through the
  plan read-service path.

## Recommendation

Create a dedicated package at `src/features/plans/read-projection/` and make it
the only supported plan-domain read boundary for shared app/API consumers.

### Boundary owns

- query-to-projection orchestration for list/detail/status/attempt reads
- projection of raw plan rows into summary/detail/attempt/status outputs
- canonical summary/display-status helpers used by app consumers
- normalization of attempt status/classification and detail/status fallback
  behavior

### Boundary does not own

- raw SQL/Drizzle query construction in `src/lib/db/queries/plans.ts`
- module-detail query semantics in `src/lib/db/queries/modules.ts` (module
  detail stays outside v1 per Step 0.0 item 2)
- billing snapshot composition
- schedule/event generation
- write-service or lifecycle behavior
- user-facing error copy such as `classificationToUserMessage`

## Proposed Public Surface

Keep the public surface narrow and behavior-oriented. Recommended API:

```ts
export async function listDashboardPlanSummaries(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]>;

export async function listPlansPageSummaries(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions;
}): Promise<PlanSummary[]>;

export async function listLightweightPlansForApi(params: {
  userId: string;
  dbClient?: DbClient;
  options?: PaginationOptions;
}): Promise<LightweightPlanSummary[]>;

export async function getPlanListTotalCount(params: {
  userId: string;
  dbClient?: DbClient;
}): Promise<number>;

export async function getPlanDetailForRead(params: {
  planId: string;
  userId: string;
  dbClient?: DbClient;
}): Promise<ClientPlanDetail | null>;

export async function getPlanGenerationStatusSnapshot(params: {
  planId: string;
  userId: string;
  dbClient?: DbClient;
}): Promise<PlanDetailStatusSnapshot | null>;

export async function getPlanGenerationAttemptsForRead(params: {
  planId: string;
  userId: string;
  dbClient?: DbClient;
}): Promise<ClientGenerationAttempt[] | null>;

export function derivePlanSummaryDisplayStatus(params: {
  summary: PlanSummary;
  referenceDate: Date | string | null | undefined;
}): PlanStatus;
```

Implementation detail: per Step 0.0 item 3 the migration is one-shot. Do not
ship a long-lived compatibility barrel. If a temporary re-export from
`src/features/plans/read-service/index.ts` is used to keep the tree compiling
mid-refactor, remove it before the PR is opened for review, and delete the
`src/features/plans/read-service/` folder entirely once imports are gone.

## Step 0.0 — Confirm Scope And Freeze Decisions

1. Re-read issue `#310` and keep the problem statement authoritative:
   projection semantics are scattered; the goal is one canonical read boundary,
   not a general plan-domain rewrite.
2. **Frozen decision — module detail stays out of v1.**
   `src/lib/db/queries/modules.ts#getModuleDetail` and
   `src/app/plans/[id]/modules/[moduleId]/actions.ts` do not currently depend on
   plan-read status/completion derivation. Keeping module detail separate
   prevents scope drift into module ownership/curriculum concerns in this PR.
   Promote to v2 only when one of these triggers occurs:
   - `getModuleDetail` needs canonical plan generation status or completion
     semantics.
   - A consumer starts mixing `getModuleDetail` output with boundary summary/
     detail projections in the same surface.
   - Module-detail response-shape changes driven by plan-read truth.
3. **Frozen decision — one-shot migration, no long-lived compatibility barrel.**
   All consumers listed in Step 4.0 move to the new package in the same PR.
   `src/features/plans/read-service/plan-read-service.ts` and the surrounding
   `read-service/` folder get deleted once imports are gone. If a temporary
   re-export is needed mid-PR to keep the tree green during refactor, remove it
   before the PR is opened for review.
4. Keep response shapes stable for:
   - `GET /api/v1/plans`
   - `GET /api/v1/plans/:planId`
   - `GET /api/v1/plans/:planId/status`
   - `GET /api/v1/plans/:planId/attempts`
   Response-shape stability is enforced mechanically via the snapshot tests
   added in Step 5.0.

## Step 1.0 — Create The Canonical Boundary Package

Create `src/features/plans/read-projection/` with a narrow public barrel.
Recommended internal split:

- `index.ts` — public exports only
- `service.ts` — orchestration entrypoints listed in "Proposed Public Surface"
- `projectors.ts` — pure summary/detail/attempt/status projection helpers
- `selectors.ts` — summary display-status helpers used by app/UI consumers
- `types.ts` — boundary-local exported helper types only if needed

Do not leak Drizzle query-builder types through the barrel. Keep DB row bundle
types internal to the boundary or sourced from `src/lib/db/queries/plans.ts`.

## Step 2.0 — Move Projection Semantics Behind The Boundary

Move or re-home the current projection logic so callers stop mixing layers:

1. Detail path:
   - fold `buildLearningPlanDetail`
   - fold `toClientPlanDetail`
   - keep `buildPlanDetailStatusSnapshot` in the same package as the detail
     projection, not in a separate sibling layer
2. Attempts path:
   - fold `toClientGenerationAttempts`
   - keep attempt status/classification normalization in the boundary
3. Summary path:
   - fold `buildPlanSummaries`
   - fold `buildLightweightPlanSummaries`
   - keep completion/status derivation next to summary projection instead of
     splitting it across `read-models/summary.ts` and `status/read-status.ts`
4. Status path:
   - keep one canonical generation-read derivation
   - keep detail polling snapshot assembly in the same boundary package
   - leave `classificationToUserMessage` outside the boundary because that is
     presentation copy, not read-model truth

Transition rule: if a helper remains used only internally, make it file-local
or package-local. Do not keep a broad set of individually importable helper
modules unless a real second consumer exists.

## Step 3.0 — Canonicalize App-Level Status Consumers

This is the highest drift risk today.

1. Replace direct imports of `deriveCanonicalPlanSummaryStatus` from app helpers
   with a boundary-owned selector, recommended name:
   `derivePlanSummaryDisplayStatus({ summary, referenceDate })`.
2. Move the paused/staleness overlay out of
   `src/app/plans/components/plan-utils.ts` and into the boundary selector so
   the app no longer invents status semantics on top of read-service data.
3. Update `src/app/dashboard/components/activity-utils.ts` to consume the same
   boundary selector for active/generating ranking decisions.
4. Keep milestone-generation copy and date formatting in the app layer. Only
   move the status truth, not all dashboard presentation code.

## Step 4.0 — Migrate Consumers To One Entry Point

Primary migration targets:

- `src/app/api/v1/plans/route.ts`
- `src/app/api/v1/plans/[planId]/route.ts`
- `src/app/api/v1/plans/[planId]/status/route.ts`
- `src/app/api/v1/plans/[planId]/attempts/route.ts`
- `src/app/plans/components/PlansContent.tsx`
- `src/app/dashboard/components/DashboardContent.tsx`
- `src/app/plans/[id]/actions.ts`
- `src/app/plans/components/plan-utils.ts`
- `src/app/dashboard/components/activity-utils.ts`

End-state rule: no app/API consumer should need to import from a mix of

- `src/features/plans/read-service/*`
- `src/features/plans/read-models/*`
- `src/features/plans/status/read-status.ts`

to answer one read concern.

## Step 5.0 — Test At The Boundary, Not At Every Former Layer

Testing direction from the issue is correct: assert observable outputs at the
boundary and keep query integration tests only for ownership, ordering, and DB
behavior.

Recommended test reshaping:

- add boundary unit tests for:
  - summary projection
  - lightweight summary projection
  - detail projection
  - status snapshot projection
  - attempt projection
  - display-status / paused-status selector, with matrix coverage for:
    active, generating, paused<30d, paused≥30d, stale (covers
    `PlansContent` and `DashboardContent` ranking drift risk noted in Risks).
- add API response-shape snapshot tests to lock AC3 mechanically:
  - `GET /api/v1/plans`
  - `GET /api/v1/plans/:planId`
  - `GET /api/v1/plans/:planId/status`
  - `GET /api/v1/plans/:planId/attempts`
  Suggested location: `tests/integration/api/plans/*.contract.spec.ts`. Each
  spec freezes the serialized response shape for a representative happy-path
  fixture so reviewers see any contract drift in the diff.
- keep integration tests for:
  - `tests/integration/db/plans.queries.spec.ts`
  - `tests/integration/db/modules.queries.spec.ts` (module detail stays outside
    the boundary per Step 0.0 decision)
- slim or delete scattered helper-first tests once boundary coverage replaces
  them:
  - `tests/unit/api/plan-status.spec.ts`
  - `tests/unit/plans/summary-boundaries.spec.ts`
  - `tests/unit/mappers/detailToClient.spec.ts`
  - `tests/unit/mappers/planQueries.spec.ts`

Do not delete low-level tests blindly. Remove them only after each behavior is
covered once at the boundary level.

## Step 6.0 — Validation

Run focused checks first, then repo baselines:

```bash
pnpm vitest run tests/unit/api/plan-status.spec.ts
pnpm vitest run tests/unit/plans/summary-boundaries.spec.ts
pnpm vitest run tests/unit/mappers/detailToClient.spec.ts
pnpm vitest run tests/unit/mappers/planQueries.spec.ts
pnpm vitest run tests/integration/db/plans.queries.spec.ts
pnpm test:changed
pnpm check:full
```

If tests move or rename during implementation, keep command intent equivalent:
boundary-focused unit coverage, query integration coverage, then changed-tree
and repo-wide static validation.

## Issue Verification And Closure

Before closing issue `#310`, walk each acceptance criterion with direct
evidence:

- one canonical plan read boundary exists
- shared app/API consumers import that boundary rather than mixed helper layers
- summary/detail/status/attempt semantics remain stable
- module-detail scope decision is explicit
- boundary tests cover observable outputs
- query integration coverage still proves ownership/ordering behavior

Close the GitHub issue only after merge and after the evidence table in
`todos.md` is fully populated.

## Risks

- Status semantics drift during migration if the paused overlay moves but the
  dashboard ranking logic still uses an older helper.
- Public contract churn if the implementation tries to redefine shared DTO types
  instead of wrapping existing shapes first.
- Over-scoping into module detail, schedules, or dashboard presentation beyond
  the read-model boundary problem.
- Accidentally leaving a temporary compatibility re-export from
  `src/features/plans/read-service/index.ts` in the final PR. Step 0.0 item 3
  forbids long-lived barrels; the folder must be deleted before review.

## Non-Goals

- No schema or migration changes.
- No billing snapshot or plan-limit work.
- No write-service consolidation.
- No schedule/event generation rewrite.
- No routing/auth boundary changes.
- No UI redesign.

## Resolved Decisions

- **Module detail scope:** stays outside the new boundary for v1. See Step 0.0
  item 2 for promotion triggers.
- **Compatibility barrel:** none long-lived. One-shot consumer migration in the
  same PR. See Step 0.0 item 3.
