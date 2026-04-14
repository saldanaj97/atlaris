# Prelim Refactor Findings

Temporary consolidation of refactor recommendations from the GPT-5.4 and Claude Opus 4.6 review passes. This repo-local copy exists for easy access during planning and implementation and can be deleted when it is no longer useful.

## Strongest shared refactor themes

| Priority | Shared theme | Why it kept surfacing | Main evidence | Best first slice |
| --- | --- | --- | --- | --- |
| 1 | Create one plan detail/status boundary | Plan detail fetching, status derivation, read-model shaping, and UI/API consumption are split across too many layers. | `src/lib/db/queries/plans.ts`, `src/features/plans/read-models/detail.ts`, `src/features/plans/read-models/summary.ts`, `src/app/plans/[id]/components/PlanDetailContent.tsx`, `src/app/api/v1/plans/[planId]/route.ts`, `src/app/api/v1/plans/[planId]/status/route.ts`, `src/app/plans/components/plan-utils.ts` | Add a `PlanReadService` / `PlanDetailFacade`, then route all detail/status consumers through it. |
| 2 | Make one module the authority for plan generation lifecycle | Stream/retry/session/SSE/orchestrator responsibilities are spread across routes, feature code, hooks, and helpers. | `src/app/api/v1/plans/stream/route.ts`, `src/app/api/v1/plans/[planId]/retry/route.ts`, `src/app/api/v1/plans/stream/helpers.ts`, `src/features/plans/session/server-session.ts`, `src/features/plans/lifecycle/service.ts`, `src/features/ai/orchestrator.ts` | Move lifecycle ownership into one feature-level module; keep routes HTTP-only. |
| 3 | Fix architectural leakage between app, route, feature, UI, and DB layers | Business logic depends upward on route/UI code; app code reaches straight into DB/query modules. | `src/features/plans/session/server-session.ts` importing route helpers, `src/features/billing/local-catalog.ts` importing from UI, many `src/app/*` imports into `@/lib/db/*` | Introduce feature facades and block direct `src/app -> lib/db/queries` imports. |
| 4 | Split `src/lib/config/env.ts` by domain | It is a monolith, high-blast-radius edit hotspot, and over-imported. | `src/lib/config/env.ts` (~761 LOC, many env groups) | Break into config facets: auth, billing, ai, db, observability, queue, etc. |
| 5 | Unify client-side generation/creation state | Manual flow, PDF flow, pending state, streaming, polling, retry, and cancellation are modeled in separate places. | `src/features/plans/session/usePlanGenerationSession.ts`, `src/hooks/usePlanStatus.ts`, `src/app/plans/new/components/PdfCreatePanel.tsx`, `src/app/plans/[id]/components/PlanPendingState.tsx`, `src/app/plans/new/components/plan-form/UnifiedPlanInput.tsx` | Pull the lifecycle into one controller/shared draft model, then let UIs consume slices. |
| 6 | Extract smaller, reusable low-level utilities | Several important behaviors are duplicated in slightly different ways. | Error normalization, completion metrics, relative-time formatting, repeated API parsing/error wrapping | Do these as low-risk cleanup slices before deeper lifecycle work. |

## GPT-5.4 findings

### 1. Single plan detail/status boundary

- **Impact:** High
- **Evidence:** `src/lib/db/queries/plans.ts`, `src/features/plans/read-models/detail.ts`, `src/app/plans/[id]/components/PlanDetailContent.tsx`, `src/app/api/v1/plans/[planId]/route.ts`, `src/app/api/v1/plans/[planId]/status/route.ts`
- **Problem:** Detail fetching, status snapshots, read-model shaping, and DTO mapping are spread across queries, mappers, routes, and components.
- **Refactor:** Create a `PlanDetailFacade` / `PlanReadService` that owns fetching, status derivation, and DTO shaping for both page and API consumers.
- **Addendum:** Split `detail.ts` into aggregation, status snapshot, and client mapping layers.

### 2. Merge stream/retry generation orchestration into one deep module

- **Impact:** High
- **Evidence:** `src/app/api/v1/plans/stream/route.ts`, `src/app/api/v1/plans/[planId]/retry/route.ts`, `src/features/plans/session/server-session.ts`
- **Problem:** Stream and retry routes duplicate session setup/cleanup/lifecycle wiring, and feature code reaches up into route helpers.
- **Refactor:** Move shared generation-session orchestration into `src/features/plans/session/` and keep routes thin and HTTP-specific.
- **Addendum:** Make one module the clear authority for generation lifecycle across route, lifecycle service, generation adapter, and AI orchestrator layers.

### 3. Split job queue/query persistence by responsibility

- **Impact:** High
- **Evidence:** `src/lib/db/queries/jobs.ts`, `src/lib/db/queries/helpers/attempts-persistence.ts`
- **Problem:** Queue mutations, retry logic, monitoring queries, normalization, and persistence/materialization are packed into large procedural modules.
- **Refactor:** Separate queue mutations, retry policy, monitoring queries, and attempt/module materialization behind smaller deep modules.

### 4. Unify client-side plan generation state machines

- **Impact:** High
- **Evidence:** `src/features/plans/session/usePlanGenerationSession.ts`, `src/hooks/usePlanStatus.ts`, `src/app/plans/new/components/PdfCreatePanel.tsx`, `src/app/plans/[id]/components/PlanPendingState.tsx`
- **Problem:** Streaming, polling, retry, cancel, upload/extraction, and pending-state behavior are modeled in separate hooks/components with overlapping lifecycle concepts.
- **Refactor:** Introduce one lifecycle controller/state machine for `extract -> create/retry -> stream -> poll -> terminal`.

### 5. Remove app-layer/type leakage into features

- **Impact:** Medium
- **Evidence:** `src/features/plans/session/server-session.ts` importing route helpers; `src/features/billing/local-catalog.ts` importing `TierKey` from `src/app/pricing/components/PricingTiers.tsx`
- **Problem:** Feature modules depend on route/UI modules, weakening architectural boundaries.
- **Refactor:** Move shared helpers/types into feature/shared modules and have app code import downward.

### 6. Break `env.ts` into domain config modules

- **Impact:** Medium to High
- **Evidence:** `src/lib/config/env.ts`
- **Problem:** One large module owns app, db, auth, Stripe, AI, AV, queue, logging, observability, and dev/test concerns.
- **Refactor:** Split into domain modules with shared parsing helpers in a base file.
- **Addendum:** Move test-only helpers like `setDevAuthUserIdForTests` out of runtime config.

### 7. Create one shared plan-creation domain model

- **Impact:** Medium
- **Evidence:** `src/app/plans/new/components/plan-form/UnifiedPlanInput.tsx`, `src/app/plans/new/components/PdfCreatePanel.tsx`, `src/app/plans/new/components/CreatePlanPageClient.tsx`, `src/features/plans/create-mapper`
- **Problem:** Manual and PDF creation flows manage draft state and mapping separately even though they converge on the same request shape.
- **Refactor:** Introduce a shared `PlanCreationDraft` with common validation/mapping and layer PDF-specific concerns on top.

### 8. Extract origin-specific creation workflows from `PlanLifecycleService`

- **Impact:** High
- **Evidence:** `src/features/plans/lifecycle/service.ts` (`createPlan()`, `createPdfPlan()`)
- **Problem:** Validation, caps, duplicate detection, insert logic, quota handling, and rollback are partially duplicated but ordered differently.
- **Refactor:** Keep a shared creation pipeline and isolate divergent `ai` vs `pdf` behavior into origin strategies.

### 9. Unify plan status derivation into a clear domain boundary

- **Impact:** High
- **Evidence:** `src/features/plans/status.ts`, `src/features/plans/read-models/summary.ts`, `src/app/plans/components/plan-utils.ts`
- **Problem:** "Status" exists in multiple layers with different meanings: generation lifecycle, learning-progress status, and UI-only pause/staleness logic.
- **Refactor:** Centralize status derivation behind an explicit domain API with named variants.

### 10. Add a coherent plan-read/query facade

- **Impact:** Medium
- **Evidence:** `src/lib/db/queries/plans.ts`, `src/features/plans/read-models/*`
- **Problem:** Query orchestration and shape-building are split across DB-query and read-model layers with multiple summary/detail paths.
- **Refactor:** Introduce a plan read facade that owns summary/detail/status retrieval.

### GPT-5.4 prioritized top themes

1. Plan detail/status boundary
2. Generation lifecycle authority
3. Architectural leakage cleanup
4. `env.ts` split
5. Shared creation/generation model

## Claude Opus 4.6 findings

### 1. Enforce feature-layer encapsulation

- **Impact:** High
- **Evidence:** many `src/app/*` imports directly into `@/lib/db/*`; routes and components bypassing `src/features/*`
- **Problem:** Feature boundaries become meaningless when app code reaches straight into DB queries/runtime.
- **Refactor:** Introduce domain facades under `src/features/*` and add a restriction rule blocking direct `src/app -> lib/db/queries` imports.

### 2. Split `env.ts`

- **Impact:** High
- **Evidence:** `src/lib/config/env.ts` (~761 LOC, many env groups, many importers)
- **Problem:** Every import pays for the whole module; tests and mocks fight unrelated module-level side effects.
- **Refactor:** Split into `env/app.ts`, `env/database.ts`, `env/stripe.ts`, `env/ai.ts`, `env/auth.ts`, etc., with `env/shared.ts` and a compatibility barrel.

### 3. Consolidate plan status derivation

- **Impact:** Medium to High
- **Evidence:** `src/features/plans/status.ts`, `src/features/plans/read-models/summary.ts`, `src/app/plans/components/plan-utils.ts`, `src/features/plans/read-models/detail.ts`, `src/app/dashboard/components/activity-utils.ts`
- **Problem:** Different layers compute different plan statuses; detail and list can diverge.
- **Refactor:** Introduce one canonical status derivation boundary and one shared relative-time utility.

### 4. Break up `PdfCreatePanel.tsx`

- **Impact:** Medium
- **Evidence:** `src/app/plans/new/components/PdfCreatePanel.tsx` (~508 LOC)
- **Problem:** One component owns upload orchestration, extraction lifecycle, response parsing, feedback, generation triggering, and phase UI.
- **Refactor:** Extract `usePdfExtraction()` and leave the component as a phase-switching orchestrator.

### 5. Extract streaming side-effects from `stream/helpers.ts`

- **Impact:** Medium
- **Evidence:** `src/app/api/v1/plans/stream/helpers.ts`
- **Problem:** SSE event formatting/emission is mixed with DB persistence, usage recording, finalization, and error shaping.
- **Refactor:** Separate emission/wire formatting from persistence/finalization side-effects.

### 6. Reduce AI orchestrator coordination surface

- **Impact:** Medium
- **Evidence:** `src/features/ai/orchestrator.ts`
- **Problem:** Provider selection, pacing, failure classification, stream parsing, timeout management, and persistence coordination are concentrated in one large flow.
- **Refactor:** Pull out strategy functions like `selectProvider()`, `classifyFailure()`, and `applyPacing()`.

### 7. Standardize API route error handling

- **Impact:** Low to Medium
- **Evidence:** repeated request JSON parsing and wrapping in several API routes
- **Problem:** Each route reimplements similar parsing/validation/error-wrapping patterns.
- **Refactor:** Shared `parseJsonBody()` / request helper in `src/lib/api`.

### 8. Consolidate `unknown -> error` normalization

- **Impact:** High
- **Evidence:** `src/lib/errors.ts`, `src/lib/api/error-normalization.ts`, `src/lib/api/coerce-unknown-to-message.ts`, `src/app/api/v1/plans/stream/helpers.ts`
- **Problem:** Multiple overlapping ways to normalize caught `unknown` values into usable errors.
- **Refactor:** Create one `normalizeUnknownError()` and make the others wrappers/projections.

### 9. Deduplicate relative-time formatting

- **Impact:** Medium
- **Evidence:** `src/app/plans/components/plan-utils.ts`, `src/app/dashboard/components/activity-utils.ts`
- **Problem:** Different helpers generate different relative-time strings with different semantics.
- **Refactor:** One shared relative-time formatter with compact/verbose and past/future options.

### 10. Extract completion-metric aggregation from read models

- **Impact:** Medium
- **Evidence:** `src/features/plans/read-models/detail.ts`, `src/features/plans/read-models/summary.ts`
- **Problem:** Both compute the same completion metrics independently.
- **Refactor:** Introduce one pure `computeCompletionMetrics()` helper.

### 11. Extract SSE stream reader from `usePlanGenerationSession.ts`

- **Impact:** Medium
- **Evidence:** `src/features/plans/session/usePlanGenerationSession.ts`
- **Problem:** SSE reading/parsing and React state transitions are tightly coupled.
- **Refactor:** Move stream parsing into a non-React async generator and keep the hook as a wrapper.

### 12. Lifecycle barrel cleanup

- **Impact:** Low
- **Evidence:** `src/features/plans/lifecycle/index.ts`
- **Problem:** Over-broad barrel and duplicate comments create noise.
- **Refactor:** Narrow barrel exports / split sub-barrels and clean up duplicated section comments.

### Claude Opus 4.6 prioritized top themes

1. Feature-layer encapsulation
2. `env.ts` split
3. Plan status derivation consolidation
4. Error normalization
5. Read-model metric and relative-time deduplication

## Overlap map

| Theme | GPT-5.4 | Opus 4.6 | Overlap strength |
| --- | --- | --- | --- |
| Split `env.ts` | Yes | Yes | Very strong |
| One lifecycle authority for plan generation | Yes | Yes | Very strong |
| Unify plan detail/status ownership | Yes | Yes | Very strong |
| Fix architectural leakage / enforce boundaries | Yes | Yes | Very strong |
| Break up `PdfCreatePanel.tsx` / client generation state | Yes | Yes | Strong |
| Consolidate status derivation | Yes | Yes | Strong |
| Split `detail.ts` responsibilities | Yes | Partially | Strong |
| Shared plan creation model | Yes | Indirectly | Medium |
| Split job persistence / queue responsibilities | Yes | Indirectly | Medium |
| Error normalization | Indirectly | Yes | Medium, Opus-led |
| Completion-metric aggregation | Indirectly | Yes | Medium, Opus-led |
| Relative-time utility | Indirectly | Yes | Medium, Opus-led |
| API route parsing/error helper | No | Yes | Low, Opus-led |
| Lifecycle barrel cleanup | No | Yes | Low, Opus-led |

## Unique emphasis by model

### GPT-5.4

1. Plan read boundary as a first-class refactor target (`PlanDetailFacade` / `PlanReadService`)
2. Shared plan-creation model across manual and PDF flows
3. `PlanLifecycleService` origin strategies for `ai` vs `pdf`
4. Split jobs/attempt persistence into queue policy, monitoring, mutations, and materialization
5. Generation lifecycle as a single authority, not just helper cleanup

### Claude Opus 4.6

1. Consolidate error normalization into one shared utility
2. Extract `computeCompletionMetrics()` from read models
3. Deduplicate relative-time formatting across plan and dashboard surfaces
4. Extract stream parsing from `usePlanGenerationSession.ts` as a non-React primitive
5. Standardize API request parsing/error wrapping
6. Feature-layer encapsulation framed as an enforcement problem, including lint restrictions

## Recommended implementation slices

| Slice | Goal | Included recommendations | Risk | Why this slice exists |
| --- | --- | --- | --- | --- |
| Slice A - Mechanical, high-ROI simplifications | Reduce cognitive load with low-risk moves | Split `env.ts`; consolidate `normalizeUnknownError()`; extract `computeCompletionMetrics()`; unify relative-time formatting | Low | Safe, broad value, minimal behavioral change |
| Slice B - Boundary cleanup | Restore clean architecture | Feature-layer facades; remove feature imports from route/UI code; stop `src/app` from importing DB queries directly; add import restrictions | Medium | Prevents future refactors from getting blocked by hidden coupling |
| Slice C - Plan read-model consolidation | Make reads/status coherent | `PlanReadService` / `PlanDetailFacade`; canonical status API; split `detail.ts` into aggregate/status/mapper; unify summary/detail paths | Medium | Biggest clarity win on the plan read side |
| Slice D - Generation lifecycle consolidation (backend) | Make generation workflow legible and maintainable | One lifecycle authority; merge stream/retry orchestration; split `stream/helpers.ts`; origin strategies in `PlanLifecycleService`; split job persistence; trim AI orchestrator coordination | High | Highest long-term payoff, highest regression risk |
| Slice E - Client lifecycle/UI extraction | Simplify UI state management | Unified client generation controller; shared `PlanCreationDraft`; `usePdfExtraction()`; extract SSE reader from `usePlanGenerationSession.ts`; simplify `PdfCreatePanel.tsx` | Medium to High | Best after backend ownership is clearer |
| Slice F - API polish and cleanup | Standardize common route patterns | `parseJsonBody()` helper; lifecycle barrel cleanup | Low | Good cleanup after the main structural work |

## Suggested execution order

1. Slice A - Mechanical, high-ROI simplifications
   - `env.ts`
   - `normalizeUnknownError()`
   - `computeCompletionMetrics()`
   - shared relative-time utility
2. Slice B - Boundary cleanup
   - feature facades
   - remove upward imports
   - restrict direct app -> DB-query access
3. Slice C - Plan read-model consolidation
   - `PlanReadService` / `PlanDetailFacade`
   - canonical status derivation
   - split `detail.ts`
4. Slice D - Generation lifecycle consolidation
   - one lifecycle authority
   - merge stream/retry/session helpers
   - split stream persistence/emission concerns
   - revisit job persistence boundaries
5. Slice E - Client lifecycle/UI extraction
   - shared creation/generation controller
   - `usePdfExtraction()`
   - thin `PdfCreatePanel`
   - thin `usePlanGenerationSession()`
6. Slice F - API polish
   - route parsing/error helper
   - barrel cleanup

## Short version

1. The plan system has too many ownership boundaries for reads, status, and generation lifecycle.
2. The architecture leaks across layers more than it should.
3. `env.ts` is a monolith and should be split early.
4. Tactical dedup wins like error normalization, completion metrics, and relative-time formatting are low-risk and worth doing soon.
5. `PdfCreatePanel.tsx` and `usePlanGenerationSession.ts` are the clearest client-side extraction targets.
