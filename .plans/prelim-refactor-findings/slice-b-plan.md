# Slice B — Boundary cleanup implementation plan

## Step B.0 — confirm scope / ACs from prelim-plan + prelim-research

### Scope confirmed from shared research

- This slice stays second in the overall execution order: **Slice A → Slice B → Slice C → Slice D**.
- The slice goal is to restore architectural boundaries without pulling Slice C read-model consolidation or Slice D lifecycle consolidation forward.
- The shared research identifies four concrete work items for this slice:
  1. introduce feature-layer facades,
  2. remove upward imports from feature modules into app/UI modules,
  3. stop direct `src/app -> lib/db/queries/plans` **read** imports,
  4. add an enforcement mechanism so the boundaries do not regress.

### Acceptance criteria

1. **Feature-owned seam exists for plan reads**
   - `src/features/plans/...` exposes the stable read entrypoint that app routes, server components, and server actions import.
   - Slice B keeps that seam intentionally thin; Slice C can deepen it later.

2. **Targeted upward imports are removed**
   - `src/features/plans/session/server-session.ts` no longer imports from `src/app/api/v1/plans/stream/helpers.ts`.
   - Billing feature code no longer imports `TierKey` from `src/app/pricing/components/PricingTiers.tsx`.

3. **Targeted app plan-read consumers stop importing `@/lib/db/queries/plans` directly**
   - `src/app/dashboard/components/DashboardContent.tsx`
   - `src/app/plans/components/PlansContent.tsx`
   - `src/app/plans/[id]/actions.ts` (`getPlanForPage`)
   - `src/app/api/v1/plans/route.ts` (list reads only)
   - `src/app/api/v1/plans/[planId]/route.ts` (GET path)
   - `src/app/api/v1/plans/[planId]/status/route.ts`

4. **Enforcement exists in the current toolchain**
   - The repo gains a committed guardrail that fails CI/local validation when those boundary rules regress.

### Non-goals / keep-out lines

- Do **not** fold Slice C work into this slice:
  - no canonical status rewrite,
  - no `detail.ts` decomposition,
  - no full `PlanReadService` behavior redesign.
- Do **not** fold Slice D work into this slice:
  - no full stream/retry/session ownership rewrite,
  - no major `stream/helpers.ts` decomposition beyond what is required to move route-agnostic code downward.
- Do **not** broaden the plan-query restriction to unrelated mutations/jobs/tasks unless a tiny follow-on extraction is required to keep imports coherent.

## Step B.1 — lock the enforcement mechanism first

### Decision

Use an **architecture guard test**, not a new Biome rule, as the primary enforcement mechanism for Slice B.

### Why this is the right fit now

- `package.json` shows Biome is the only lint tool in the repo today.
- `biome.json` does not currently enforce import boundaries.
- The shared research already flags that the repo has no obvious ready-to-enable import-boundary rule.
- Adding ESLint, dependency-cruiser, or another dedicated architecture tool would expand scope and create more churn than this slice needs.

### Planned enforcement shape

Add a focused unit-level architecture test (recommended path: `tests/unit/architecture/import-boundaries.spec.ts`) that scans source imports and fails on these rules:

1. `src/features/**` must not import from `@/app/**` or relative paths that resolve into `src/app/**`.
2. `src/app/**` must not import **plan-read exports** from `@/lib/db/queries/plans`.

### Rule details for the first version

- For the app-plan-read rule, block the specific read entrypoints that this slice is moving:
  - `getPlanSummariesForUser`
  - `getLightweightPlanSummaries`
  - `getPlanSummaryCount`
  - `getLearningPlanDetail`
  - `getPlanStatusForUser`
- Do **not** fail on non-scope imports that remain legitimate for now (example: `deletePlan` in the DELETE handler, or non-plan query modules such as tasks/jobs).
- Implement the test with the existing toolchain only:
  - use `glob`/filesystem reads,
  - parse import declarations via the installed `typescript` package or a narrow import-regex if AST parsing is simpler,
  - keep the failure output file-oriented and explicit.

### TDD order for the guardrail

1. Write the failing architecture spec with the current violations encoded.
2. Confirm it flags the known offenders from the research.
3. Keep the spec red while refactors happen.
4. Make it green only after all consumer migrations are complete.

## Step B.2 — move shared ownership downward before migrating consumers

### B.2.a Billing type ownership

Create a feature-owned billing type module so the billing feature no longer depends on pricing UI:

- Recommended new file: `src/features/billing/types.ts`
- Move canonical tier type ownership there:
  - `TierKey`
  - `PaidTierKey` (`Exclude<TierKey, 'free'>`) if useful
  - optional shared tier key constant if needed for type derivation

### Billing migration sequence

1. Introduce the feature-owned billing types.
2. Update `src/features/billing/local-catalog.ts` to import from the new feature-owned file.
3. Update pricing UI consumers to import the shared type from the feature layer instead of deriving/exporting it from `PricingTiers.tsx`:
   - `src/app/pricing/components/PricingTiers.tsx`
   - `src/app/pricing/components/pricing-config.ts`
   - `src/app/pricing/components/PricingGrid.tsx`
   - `src/app/pricing/components/stripe-pricing.ts`
   - `src/app/pricing/page.tsx`
4. Leave pricing presentation data in app/UI code; only the shared type ownership moves.

### B.2.b Stream/session helper ownership

Move route-agnostic session/stream helpers out of the route layer so feature session code imports downward only.

- Recommended new file: `src/features/plans/session/stream-session.ts`
- Move feature-owned exports there:
  - `buildPlanStartEvent`
  - `executeLifecycleGenerationStream`
  - `safeMarkPlanFailed`
- Keep route-only HTTP helpers in `src/app/api/v1/plans/stream/helpers.ts` until Slice D decides the final backend split.

### Session migration sequence

1. Create `src/features/plans/session/stream-session.ts` and move the route-agnostic exports into it.
2. Update `src/features/plans/session/server-session.ts` to import from the new feature-owned session module.
3. Update `src/app/api/v1/plans/[planId]/retry/route.ts` to import `safeMarkPlanFailed` from the same feature-owned session module.
4. Reduce `src/app/api/v1/plans/stream/helpers.ts` to route-facing/transitional helpers only.

### Guardrails for this step

- Do not redesign generation lifecycle behavior here.
- Preserve SSE event names and payload shapes exactly.
- Preserve retry-route behavior exactly; only ownership should move.

## Step B.3 — create the thin feature-layer facade for plan reads

### Facade destination

Create the read seam that later slices can deepen without forcing another app-wide import migration.

- Recommended file: `src/features/plans/read-service/index.ts`

### Facade design constraints

- Keep the facade **use-case named**, not just a re-export of DB function names.
- Keep it **thin** in Slice B: wrappers are acceptable if they give later slices a stable import destination.
- Do not move `toClientPlanDetail()` or status-derivation consolidation into this slice unless required to preserve current route contracts.

### Recommended façade API

Use a small named surface such as:

- `listDashboardPlanSummaries(...)`
- `listPlansPage(...)`
- `getPlanDetail(...)`
- `getPlanGenerationStatus(...)`

Implementation can still delegate to today’s query/read-model functions internally. The key requirement is that `src/app/**` imports the feature seam instead of `@/lib/db/queries/plans`.

### Signature recommendation

Prefer object parameters for the new facade entrypoints where that improves future extensibility, especially for optional `dbClient` plumbing. Example shape:

```ts
getPlanDetail({ planId, userId, dbClient? })
```

This gives Slice C room to add richer orchestration without another breaking import pass.

## Step B.4 — migrate the current app plan-read consumers to the feature facade

### Consumer migration list

1. `src/app/dashboard/components/DashboardContent.tsx`
   - Replace direct `getPlanSummariesForUser` query import with the feature read facade.

2. `src/app/plans/components/PlansContent.tsx`
   - Replace direct list/count query usage with the facade while preserving the current `getBillingAccountSnapshot()` call.

3. `src/app/plans/[id]/actions.ts`
   - Move `getPlanForPage()` to the new facade.
   - Leave unrelated task/schedule logic unchanged.

4. `src/app/api/v1/plans/route.ts`
   - Replace direct lightweight list/count query imports with the facade.
   - Preserve pagination parsing and response headers.

5. `src/app/api/v1/plans/[planId]/route.ts`
   - Move the GET path to the facade.
   - Keep DELETE scoped separately; it may remain on `deletePlan` for now if that avoids unnecessary slice expansion.

6. `src/app/api/v1/plans/[planId]/status/route.ts`
   - Replace direct `getPlanStatusForUser` usage with the facade.
   - Preserve the current `classificationToUserMessage()` mapping and cache header behavior.

### Migration discipline

- Split mixed imports so only the plan-read portion moves.
- Preserve response contracts exactly; this slice is about ownership, not behavior changes.
- Keep route/server-component auth wrappers (`withAuthAndRateLimit`, `withServerComponentContext`, `withServerActionContext`) exactly where they are.

## Step B.5 — make the guardrail green and codify exceptions

### Finish the architecture test

Once the code migrations are done:

1. Update the architecture spec’s allow/deny list to the final intended state.
2. Confirm no targeted feature file imports from `@/app/**`.
3. Confirm no targeted app read consumer imports the blocked read exports from `@/lib/db/queries/plans`.

### Expected steady-state policy after Slice B

- `src/features/**` may import shared/library/feature code, but not `src/app/**`.
- `src/app/**` may still import some low-level modules where the architecture intentionally allows it, but **plan reads** now go through `src/features/plans/read-service`.
- Any future expansion of boundary rules should extend this architecture spec rather than introducing a second competing enforcement path.

## Dependencies

- **Must follow Slice A** per the shared execution order.
- **Defines the destination seam for Slice C** (`src/features/plans/read-service/...`).
- **Defines the session-helper ownership point for Slice D** (`src/features/plans/session/...`).
- Integration validation depends on Docker/Testcontainers being available locally.

## Cross-slice coordination points

### With Slice C

- Slice B should establish the import destination and thin wrappers only.
- Slice C should deepen that read service instead of creating a second parallel abstraction.
- Do not rename the facade again in Slice C unless the whole team agrees first; this slice is where the stable path should be chosen.

### With Slice D

- Slice B should move only route-agnostic session helpers downward.
- Slice D should decide the final split of `stream/helpers.ts`, lifecycle orchestration, and retry/session ownership.
- Keep the new session helper module narrow enough that Slice D can extend it, not replace it.

## Likely commit split

1. **refactor:** move shared billing/session ownership into feature-layer modules
2. **refactor:** add plan read facade and migrate app plan-read consumers
3. **test:** add architecture boundary guardrail

If the migration is noisy, split the second commit into:

- app/server component consumer migration
- API route consumer migration

## Open decisions to settle before implementation starts

1. **Facade naming**
   - Recommendation: keep the path `src/features/plans/read-service/index.ts` to match the shared research and give Slice C a stable place to deepen.

2. **Architecture test location**
   - Recommendation: place it under `tests/unit/architecture/` so it runs with the existing unit-test entrypoints, even though the research used `tests/architecture/...` as shorthand.

3. **DELETE handler scope**
   - Recommendation: leave `deletePlan` where it is unless the import split becomes awkward. This slice only promises removal of direct **plan-read** imports.

4. **How much of `stream/helpers.ts` moves now**
   - Recommendation: move only the exports that are already consumed from feature code or clearly route-agnostic (`buildPlanStartEvent`, `executeLifecycleGenerationStream`, `safeMarkPlanFailed`).

## Validation steps

Run these during implementation, in roughly this order:

1. `pnpm exec tsx scripts/tests/run.ts unit tests/unit/architecture/import-boundaries.spec.ts`
2. `pnpm exec tsx scripts/tests/run.ts unit tests/unit/app/plans/actions.spec.ts`
3. `pnpm exec tsx scripts/tests/run.ts integration tests/integration/contract/plans.get.spec.ts`
4. `pnpm exec tsx scripts/tests/run.ts integration tests/integration/contract/plans.status-parity.spec.ts`
5. `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans-list-pagination.spec.ts`
6. `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans.status.rls.spec.ts`
7. `pnpm check:lint`
8. `pnpm check:type`
9. `pnpm test:changed`
10. `pnpm check:full`

Notes:

- Steps 3-6 require Docker/Testcontainers.
- If the billing-type move adds pricing-only unit coverage, run the most targeted pricing unit test file instead of widening the suite unnecessarily.

## Verification / closure

### AC 1 — feature-owned read seam exists

**Proof**

- `src/features/plans/read-service/index.ts` exists.
- The targeted app consumers import from that feature path instead of `@/lib/db/queries/plans`.
- `rg "@/lib/db/queries/plans" src/app` only shows allowed non-scope exceptions after the migration.

### AC 2 — upward feature imports are removed

**Proof**

- `rg "@/app/" src/features` no longer reports:
  - `src/features/plans/session/server-session.ts`
  - `src/features/billing/local-catalog.ts`
- The architecture spec fails if a new `src/features -> src/app` import appears.

### AC 3 — direct app plan-read imports are gone

**Proof**

- The targeted files no longer import:
  - `getPlanSummariesForUser`
  - `getLightweightPlanSummaries`
  - `getPlanSummaryCount`
  - `getLearningPlanDetail`
  - `getPlanStatusForUser`
  from `@/lib/db/queries/plans`.
- Route and server-component behavior is still covered by the targeted unit/integration tests above.

### AC 4 — enforcement is in place

**Proof**

- `tests/unit/architecture/import-boundaries.spec.ts` is committed and passing.
- The repo can catch the regression with the normal unit-test runner; no extra external lint stack is required.

### Done condition

Slice B is complete when:

- the feature-facade destination is established,
- the known upward imports are removed,
- targeted app plan-read consumers stop importing plan queries directly,
- the architecture guardrail is committed and green,
- and the validation commands above pass.
