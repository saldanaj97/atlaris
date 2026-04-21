# Research: Plan Read Models

> **Research date:** 2026-04-05
> **Status:** Initial research complete - ready for planning decisions
> **Scope note:** This document covers candidate `#4` from the architecture shortlist ("Plan read models"), not GitHub issue `#4` in `saldanaj97/atlaris`, which is already merged and unrelated.

## Current-State Summary

The repo does not have a real plan read-model boundary yet. It has a set of query functions, access wrappers, mapper functions, and page-local derivations that together behave like one concept, but no single module owns that concept.

The current flow is split like this:

1. Query layer assembles raw plan/module/task/progress/resource shapes:
   - `getPlanSummariesForUser()` in `src/lib/db/queries/plans.ts:95-155`
   - `getLightweightPlanSummaries()` in `src/lib/db/queries/plans.ts:162-236`
   - `getLearningPlanDetail()` in `src/lib/db/queries/plans.ts:247-317`
   - `getModuleDetail()` in `src/lib/db/queries/modules.ts:32-148`
2. Server actions wrap those queries in access/result unions:
   - `getPlanForPage()` in `src/app/plans/[id]/actions.ts:182-208`
   - `getModuleForPage()` in `src/app/plans/[id]/modules/[moduleId]/actions.ts:89-115`
3. Thin `data.ts` loaders pretend to be boundaries but only forward calls:
   - `loadPlanForPage()` in `src/app/plans/[id]/data.ts:8-14`
   - `loadModuleForPage()` in `src/app/plans/[id]/modules/[moduleId]/data.ts:8-14`
4. Pages and API routes do more shaping on top:
   - `PlanDetailContent` remaps detail again in `src/app/plans/[id]/components/PlanDetailContent.tsx:22-70`
   - plan detail API remaps detail again in `src/app/api/v1/plans/[planId]/route.ts:21-46`
   - `PlansContent` mixes summaries with usage in `src/app/plans/components/PlansContent.tsx:42-105`
   - `DashboardContent` derives activity feed semantics from summaries in `src/app/dashboard/components/DashboardContent.tsx:18-49`
   - `BillingCards` mixes subscription and usage reads in `src/app/settings/billing/components/BillingCards.tsx:17-149`

That is not deep modularity. It is staged assembly.

## Verified Friction

### 1. The same plan concept has multiple incompatible read shapes

The query layer exposes at least four different caller-facing plan read shapes:

- list-summary shape for dashboard and plans page in `src/lib/db/queries/plans.ts:95-155`
- lightweight API list shape in `src/lib/db/queries/plans.ts:162-236`
- full plan detail shape in `src/lib/db/queries/plans.ts:247-317`
- module detail shape in `src/lib/db/queries/modules.ts:32-148`

These are not just optimized projections. They encode different ownership of derived data:

- `mapPlanSummaries()` computes completion, minutes, and completed modules in `src/lib/db/queries/mappers.ts:69-131`
- `mapLightweightPlanSummaries()` computes a different aggregate path in `src/lib/db/queries/mappers.ts:133-170`
- `mapLearningPlanDetail()` nests tasks/resources/progress in `src/lib/db/queries/mappers.ts:172-237`
- `mapDetailToClient()` then sorts and reshapes the detail again for the UI in `src/features/plans/detail-mapper.ts:117-181`

This means "what is a plan read model?" still depends on which file the caller happens to know exists.

### 2. Detail pages still coordinate their own access and presentation contract

The plan detail path is spread across four layers:

- `getLearningPlanDetail()` assembles DB detail in `src/lib/db/queries/plans.ts:247-317`
- `getPlanForPage()` wraps that in access-result logic in `src/app/plans/[id]/actions.ts:182-208`
- `loadPlanForPage()` is just an uncached pass-through in `src/app/plans/[id]/data.ts:8-14`
- `PlanDetailContent` handles auth redirects, error display, and a second mapping step in `src/app/plans/[id]/components/PlanDetailContent.tsx:22-70`

The module detail path repeats the same pattern:

- `getModuleDetail()` in `src/lib/db/queries/modules.ts:32-148`
- `getModuleForPage()` in `src/app/plans/[id]/modules/[moduleId]/actions.ts:89-115`
- `loadModuleForPage()` in `src/app/plans/[id]/modules/[moduleId]/data.ts:8-14`
- `ModuleDetailContent` in `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx:23-77`

The duplication is structural, not accidental.

### 3. Cross-surface consumers reassemble overlapping user + plan state manually

The plans page fetches summaries and usage together in `src/app/plans/components/PlansContent.tsx:42-50`, while `PlanCountBadgeContent` separately re-fetches usage alone in `src/app/plans/components/PlansContent.tsx:17-35`.

The dashboard fetches summaries and then locally derives activities and the active plan in:

- `src/app/dashboard/components/DashboardContent.tsx:18-30`
- `src/app/dashboard/components/activity-utils.ts:35-110`

Billing fetches usage and subscription in parallel and then computes display percentages locally in `src/app/settings/billing/components/BillingCards.tsx:17-55`.

The subscription API separately reconstructs yet another subscription-plus-usage shape in `src/app/api/v1/user/subscription/route.ts:10-26`.

This is the same anti-pattern across multiple surfaces:

- wrapper choice
- `getDb()` retrieval
- manual query composition
- local derivation
- UI-specific reshaping

### 4. The "loader" layer is fake

`loadPlanForPage()` and `loadModuleForPage()` do not own caching, composition, normalization, or policy. They only call the matching server action:

- `src/app/plans/[id]/data.ts:8-14`
- `src/app/plans/[id]/modules/[moduleId]/data.ts:8-14`

The unit tests for them confirm this emptiness. They only assert "invoke every time" behavior:

- `tests/unit/app/plans/[id]/data.spec.ts:7-28`
- `tests/unit/app/plans/[id]/modules/[moduleId]/data.spec.ts:10-33`

Those tests are preserving a seam that does not buy the repo anything.

### 5. The test suite is centered on shallow seams, not business boundaries

Examples:

- `tests/integration/db/plans.queries.spec.ts:1-99` verifies raw query functions
- `tests/integration/db/plans.queries.guard.spec.ts:5-99` guards function signatures by regex
- `tests/unit/mappers/detailToClient.spec.ts:26-120` heavily tests the mapper as a standalone seam
- `tests/unit/app/plans/[id]/data.spec.ts:7-28` and `tests/unit/app/plans/[id]/modules/[moduleId]/data.spec.ts:10-33` test forwarding wrappers

This is what happens when the real boundary is missing: tests pile up around internal handoff points because there is no stronger interface to test instead.

## Scope Boundaries That Matter

### In scope for planning

- plans list / overview read models
- dashboard consumers of plan summary data
- plan detail read model
- module detail read model
- API/page duplication where both consume the same underlying plan detail
- cross-surface user + plan + usage composition when it is part of the same signed-in learning experience

### Probably out of scope for the first pass

- pricing page concerns in `src/app/pricing/page.tsx`
  - it uses authenticated user state, but not plan reads
- AI settings card in `src/app/settings/ai/components/ModelSelectionCard.tsx`
  - it uses authenticated user state, but not plan reads
- schedule generation/loading
  - it is adjacent to plan detail, but it is currently its own access/result path in `src/app/plans/[id]/actions.ts:219-240`

## Planning Implications

### 1. The next plan should not be framed as "refactor queries"

The query functions are only one layer of the problem. If the plan only reorganizes `src/lib/db/queries/plans.ts`, the page/action/API duplication will survive untouched.

### 2. The first real decision is boundary ownership

You need to decide whether the target deep module is:

- one shared read-model boundary for both pages and API routes
- one boundary for server-rendered page consumers and a thinner DTO adapter for APIs
- separate list/overview and detail/module read-model boundaries

Without that decision, the implementation will just move duplication around.

### 3. Module detail is not safely separable without a conscious choice

`getModuleDetail()` is its own query path today, but it overlaps conceptually with plan detail:

- module navigation state
- task progress/resources
- plan context

If module detail stays out of scope, that must be explicit. Otherwise the plan will drift into two partially-aligned read-model designs.

### 4. Some view-local derivation probably belongs below the page layer

The following are currently page-local or helper-local derivations:

- dashboard activities / active-plan selection in `src/app/dashboard/components/activity-utils.ts:35-110`
- plan overview/detail stats in `src/app/plans/[id]/helpers.ts:47-138`
- billing percentage display prep in `src/app/settings/billing/components/BillingCards.tsx:40-55`

Not all of that belongs in the same module, but leaving all of it in pages guarantees that every new surface repeats the same interpretive work.

## Initial Slice Candidates

These are planning candidates, not yet the final plan.

### Slice A: Plans overview read model

Own one boundary for:

- plans page summary list
- plan count badge
- dashboard summary consumers

Likely current files involved:

- `src/app/plans/components/PlansContent.tsx`
- `src/app/dashboard/components/DashboardContent.tsx`
- `src/app/dashboard/components/activity-utils.ts`
- `src/lib/db/queries/plans.ts`
- `src/lib/db/queries/mappers.ts`
- `src/features/billing/usage-metrics.ts`

### Slice B: Plan detail read model

Own one boundary for:

- plan detail page loader
- plan detail API route
- detail-to-client shaping

Likely current files involved:

- `src/app/plans/[id]/actions.ts`
- `src/app/plans/[id]/data.ts`
- `src/app/plans/[id]/components/PlanDetailContent.tsx`
- `src/app/api/v1/plans/[planId]/route.ts`
- `src/lib/db/queries/plans.ts`
- `src/features/plans/detail-mapper.ts`

### Slice C: Module detail alignment

Decide whether module detail:

- joins the same detail boundary as plan detail
- or remains a separate boundary with explicit rationale

Likely current files involved:

- `src/app/plans/[id]/modules/[moduleId]/actions.ts`
- `src/app/plans/[id]/modules/[moduleId]/data.ts`
- `src/app/plans/[id]/modules/[moduleId]/components/ModuleDetailContent.tsx`
- `src/lib/db/queries/modules.ts`

## Open Questions For Planning

These are the decisions the code cannot make for us:

1. Should the first deepened interface target both server-rendered pages and API routes, or are page read models the primary target and APIs only follow later?
2. Is module detail part of the same effort as plan detail, or is that a deliberate second phase?
3. Should schedule loading stay outside this effort, or do you want "plan detail" to mean "everything the detail page needs", including schedule?
4. Do you want dashboard activity derivation to move below the page boundary, or should the new read model stop at plan summaries and keep dashboard semantics in the page layer?
5. Do you want billing usage composition included as an adjacent consumer of the same read model effort, or treated as merely related but separate work?

## Recommended Starting Position

Based on the current tree, the least confused starting position is:

- make page read models the primary target
- treat API routes as secondary adapters over the same underlying detail/overview boundary where practical
- include module detail in the research and planning now, even if it lands as a separate slice
- keep schedule loading out of first-pass scope unless you explicitly want a larger detail-page contract

Anything looser than that will drift back into "thin wrappers around queries" and waste time.
