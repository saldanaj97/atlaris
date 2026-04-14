# Prelim Refactor Slices — Consolidated Research

> **Source plan:** `.plans/prelim-refactor-findings/prelim-plan.md`
> **Research status:** Complete enough for slice-specific planning
> **Execution order baseline:** Slice A → Slice B → Slice C → Slice D → Slice E → Slice F

---

## Slice A — Mechanical, high-ROI simplifications

### 1. Current State

- `src/lib/config/env.ts:1-761` is already split conceptually, but not physically. Shared parsing/caching lives at `33-307`, then domain exports stack together: `appEnv` (`308-361`), `databaseEnv` (`363-380`), `neonAuthEnv` (`382-402`), OAuth (`404-420`), Stripe (`422-469`), AI (`479-534`), AV (`543-598`), AI timeout (`600-617`), OpenRouter (`625-641`), local product testing (`643-658`), dev auth (`660-670`), test helpers (`672-683`), attempts (`685-696`), queue (`697-740`), logging (`742-746`), and observability (`748-761`). One file still owns almost every server config concern.
- Error normalization is split across `src/lib/errors.ts:1-95`, `src/lib/api/error-normalization.ts:1-105`, `src/lib/api/coerce-unknown-to-message.ts:1-43`, and `src/app/api/v1/plans/stream/helpers.ts:442-516`. Today the repo has separate helpers for abort detection, loggable error details, attempt-error shaping, string coercion, and SSE fallback conversion.
- Completion metrics are recomputed in both `src/features/plans/read-models/detail.ts:199-247` and `src/features/plans/read-models/summary.ts:98-130,168-197`.
- Relative-time formatting is duplicated across `src/app/plans/components/plan-utils.ts:46-74` and `src/app/dashboard/components/activity-utils.ts:10-30,130-154`, with different wording and past/future handling.
- Existing tests already cover pieces of this slice: `tests/unit/config/env.spec.ts`, `tests/unit/api/coerce-unknown-to-message.spec.ts`, `tests/unit/api/plan-status.spec.ts`, and `tests/unit/plans/summary-boundaries.spec.ts`.

**Gaps / latent issues**

- Helper semantics already diverge: plan cards use compact strings (`5m ago`, `1h ago`) while dashboard activity uses verbose strings (`5 minutes ago`) and scheduled events use a separate future formatter.
- Error normalization returns different shapes depending on call site, so a “unified” helper must keep adapters for persistence, API, and SSE instead of forcing one raw type everywhere.
- `env.ts` includes test-only helpers (`setDevAuthUserIdForTests`, `clearDevAuthUserIdForTests`) in the runtime module, so a split should isolate test-only helpers rather than just copy the monolith into smaller files.

### 2. Files to Change

| File | Change | Lines |
| --- | --- | --- |
| `src/lib/config/env.ts` | Split into domain modules behind a compatibility barrel first | `1-761` |
| `src/lib/errors.ts` | Collapse generic unknown/error helpers into a shared normalization core or wrappers | `1-95` |
| `src/lib/api/error-normalization.ts` | Rebase attempt-error helpers on the shared normalization core | `1-105` |
| `src/lib/api/coerce-unknown-to-message.ts` | Keep as wrapper or fold into shared normalization entrypoint | `1-43` |
| `src/app/api/v1/plans/stream/helpers.ts` | Replace `toFallbackErrorLike()` duplication with the shared normalization core | `442-516` |
| `src/features/plans/read-models/detail.ts` | Extract shared completion-metrics helper | `199-247` |
| `src/features/plans/read-models/summary.ts` | Reuse shared completion-metrics helper | `98-130`, `168-197` |
| `src/app/plans/components/plan-utils.ts` | Swap to shared relative-time formatter | `46-74`, `113-134` |
| `src/app/dashboard/components/activity-utils.ts` | Swap to shared relative-time formatter | `10-30`, `130-154` |

**Likely new files**

| File | Purpose |
| --- | --- |
| `src/lib/config/env/app.ts` | `appEnv` and app URL concerns |
| `src/lib/config/env/database.ts` | `databaseEnv` accessors |
| `src/lib/config/env/auth.ts` | Neon/dev auth + auth-related helpers |
| `src/lib/config/env/ai.ts` | AI + timeout + OpenRouter config |
| `src/lib/config/env/billing.ts` | Stripe config |
| `src/lib/config/env/observability.ts` | logging + Sentry config |
| `src/lib/errors/normalize-unknown.ts` | One canonical “unknown -> normalized error/message” helper |
| `src/features/plans/read-models/completion-metrics.ts` | Shared completion metrics for summary/detail |
| `src/lib/date/relative-time.ts` | Shared compact/verbose relative-time formatting |

### 3. Implementation Steps (TDD)

1. **Write helper-compatibility tests first**
   - Extend `tests/unit/config/env.spec.ts` to lock current getter behavior before moving domains.
   - Add table-driven tests for a new shared unknown-error normalizer covering `Error`, strings, plain objects with `message`, symbols/functions, abort errors, and unserializable objects.
   - Add formatter tests that lock compact (`5m ago`) vs verbose (`5 minutes ago`) vs future (`In 5m` / `Tomorrow`) output so UI strings do not drift silently.

2. **Extract pure utilities before touching call sites**
   - Introduce `computeCompletionMetrics()` and port `detail.ts` + `summary.ts` to it without changing public DTOs.
   - Introduce a shared relative-time formatter with options for compact/verbose and past/future modes, then rebase `plan-utils.ts` and `activity-utils.ts` on it.
   - Introduce `normalizeUnknownError()` (or equivalent) and keep projection wrappers for attempt persistence / client error payloads instead of forcing one raw shape everywhere.

3. **Split `env.ts` with a compatibility barrel**
   - Move domain getters into new modules while leaving `src/lib/config/env.ts` as the stable import surface initially.
   - Move test-only dev-auth helpers out of the runtime barrel last so tests can migrate without breaking unrelated importers.
   - After compatibility is proven, migrate direct imports to the domain modules opportunistically rather than in one giant rename.

4. **Validate**
   - Run focused unit coverage for env, error helpers, and plan-summary helpers before broad lint/type checks.
   - Ensure every former `env.ts` import still works through the compatibility barrel before any follow-up cleanup.

### 4. Risk Areas

- **Behavioral drift:** LOW to MEDIUM — helper semantics are easy to “simplify” incorrectly because the current outputs are intentionally inconsistent by surface.
- **Import churn:** MEDIUM — `env.ts` is a wide dependency hub, so barrel-first migration is safer than direct large-scale rewrites.
- **Cross-slice conflict:** MEDIUM with Slice C because both touch read-model files; LOW with Slice D/E/F.
- **Test gap:** the current tests cover pieces, not the combined refactor. Add golden tests before extracting shared helpers.

### 5. Estimated Overlap

- **With Slice C:** shared files `src/features/plans/read-models/detail.ts`, `src/features/plans/read-models/summary.ts`, and `src/app/plans/components/plan-utils.ts`.
- **With Slice D:** shared file `src/app/api/v1/plans/stream/helpers.ts` if error normalization is centralized there first.
- **Merge recommendation:** land helper extractions before broad read-boundary work, but keep read-model edits scoped so Slice C can rebase cleanly.

---

## Slice B — Boundary cleanup

### 1. Current State

- `src/features/plans/session/server-session.ts:1-133` is a feature-level module that imports `buildPlanStartEvent` and `executeLifecycleGenerationStream` from `src/app/api/v1/plans/stream/helpers.ts:1-639`. That is an upward dependency from feature code into the app route layer.
- `src/features/billing/local-catalog.ts:1-48` imports `TierKey` from `src/app/pricing/components/PricingTiers.tsx:1-68`, so a billing feature module depends on a UI component for a shared type.
- App routes and server components still talk directly to DB query modules instead of feature facades:
  - `src/app/dashboard/components/DashboardContent.tsx:11-30`
  - `src/app/plans/components/PlansContent.tsx:8-46`
  - `src/app/plans/[id]/actions.ts:182-207`
  - `src/app/api/v1/plans/route.ts:1-87`
  - `src/app/api/v1/plans/[planId]/route.ts:1-77`
  - `src/app/api/v1/plans/[planId]/status/route.ts:1-70`
- Lint/tooling does not enforce these boundaries today. `package.json:10-15,85-115` shows Biome is the only linter, and `biome.json:35-109` has no import-boundary rule configured.

**Gaps / latent issues**

- Boundary cleanup is partly structural and partly enforcement-related. Without an enforcement mechanism, direct `src/app -> lib/db/queries` imports will creep back in after the refactor.
- Slice B overlaps directly with Slice C (read facades) and Slice D (generation/session boundaries). If the feature facades are designed too narrowly, later slices will just recreate a second set of abstractions.

### 2. Files to Change

| File | Change | Lines |
| --- | --- | --- |
| `src/features/plans/session/server-session.ts` | Remove upward import from app route helpers | `1-133` |
| `src/app/api/v1/plans/stream/helpers.ts` | Move route-agnostic stream helpers downward or split into feature-level modules | `1-639` |
| `src/features/billing/local-catalog.ts` | Move `TierKey` ownership out of app UI | `1-48` |
| `src/app/pricing/components/PricingTiers.tsx` | Consume shared billing types instead of exporting them downward | `1-68` |
| `src/app/dashboard/components/DashboardContent.tsx` | Replace direct DB-query imports with feature read facade | `11-30` |
| `src/app/plans/components/PlansContent.tsx` | Replace direct DB-query imports with feature read facade | `8-46` |
| `src/app/plans/[id]/actions.ts` | Replace direct DB-query import with feature facade | `182-207` |
| `src/app/api/v1/plans/route.ts` | Replace direct DB-query import with feature facade | `1-87` |
| `src/app/api/v1/plans/[planId]/route.ts` | Replace direct DB-query import with feature facade | `1-77` |
| `src/app/api/v1/plans/[planId]/status/route.ts` | Replace direct DB-query import with feature facade | `1-70` |
| `biome.json` | Add enforcement only if Biome can express it; otherwise document alternate guardrail | `35-109` |

**Likely new files**

| File | Purpose |
| --- | --- |
| `src/features/plans/read-service/index.ts` | Single entrypoint for plan list/detail/status reads |
| `src/features/plans/session/stream-session.ts` | Route-agnostic SSE/session orchestration |
| `src/features/billing/types.ts` | Shared `TierKey` / billing catalog types |
| `tests/architecture/import-boundaries.spec.ts` | Optional structural enforcement if Biome cannot express the desired restriction |

### 3. Implementation Steps (TDD)

1. **Decide the enforcement mechanism first**
   - Verify whether Biome can express the import boundary required by the slice.
   - If not, add a focused architecture/spec test that asserts forbidden import paths rather than introducing a whole new linting tool.

2. **Move shared ownership downward**
   - Extract billing tier types from `PricingTiers.tsx` into a feature/shared billing module.
   - Extract stream/session helpers from `src/app/api/v1/plans/stream/helpers.ts` into a feature-owned session module so `server-session.ts` stops importing upward.

3. **Introduce feature facades**
   - Add read-only feature facades for plan list/detail/status access.
   - Migrate app routes, server actions, and server components to consume those facades rather than `@/lib/db/queries/plans` directly.

4. **Validate**
   - Run architecture guard checks first, then plan read-route tests and type-checking.
   - Confirm the same public route behavior still holds after imports move.

### 4. Risk Areas

- **Merge conflict risk with Slice C:** HIGH — both will touch read-boundary files and app consumers.
- **Merge conflict risk with Slice D:** HIGH — session/generation helpers are shared between the two slices.
- **Enforcement risk:** MEDIUM — the repo does not currently have an obvious “no restricted imports” rule ready to enable.
- **Design risk:** if the new facades mirror today’s DB query names one-for-one, the cleanup will not materially improve ownership.

### 5. Estimated Overlap

- **With Slice C:** shared plan read facade and all plan read consumers.
- **With Slice D:** shared generation/session helpers around `server-session.ts` and `stream/helpers.ts`.
- **Merge recommendation:** land boundary ownership changes before deep read-model consolidation or lifecycle refactors; otherwise those slices will build on leaking seams and become harder to untangle.

---

## Slice C — Plan read-model consolidation

### 1. Current State

- `src/lib/db/queries/plans.ts:273-413` owns plan-detail and plan-status reads, but the read model is split across query orchestration and multiple mapper/status modules.
- `src/features/plans/read-models/detail.ts:86-321` mixes three responsibilities:
  1. status snapshot derivation (`86-110`, `294-320`)
  2. detail aggregation + completion metrics (`150-250`)
  3. client DTO mapping (`253-321`)
- `src/features/plans/read-models/summary.ts:64-199` separately computes summary metrics and derives canonical summary status (`135-160`).
- `src/features/plans/status.ts:20-65` derives generation-lifecycle status for detail/status views only.
- Consumers cross this boundary differently:
  - `src/app/api/v1/plans/[planId]/route.ts:22-47` fetches `getLearningPlanDetail()` and then calls `toClientPlanDetail()`.
  - `src/app/api/v1/plans/[planId]/status/route.ts:24-67` calls `getPlanStatusForUser()` and then rewrites the latest error message.
  - `src/app/plans/[id]/actions.ts:182-207` fetches `getLearningPlanDetail()` directly for the page.
  - `src/app/plans/[id]/components/PlanDetailContent.tsx:22-70` then remaps that page result through `toClientPlanDetail()` again.
  - `src/app/plans/components/plan-utils.ts:113-134` takes summary status and adds paused/staleness logic on top.

**Gaps / latent issues**

- Detail/status/list views do not share one named status boundary. `derivePlanStatus()` in `src/features/plans/status.ts:48-64` can return `pending` for a plan whose DB generation status is already `ready` but whose modules are not present and whose attempts are below cap, while `deriveCanonicalPlanSummaryStatus()` in `src/features/plans/read-models/summary.ts:148-159` returns `active` for the same “not failed, not generating, no modules” shape.
- `PlanDetailContent` and the plan detail route both perform DTO mapping from the same raw detail shape, which increases the chance of divergence when fields change.
- The “read-model” layer also owns shared completion aggregation that Slice A wants to extract.

### 2. Files to Change

| File | Change | Lines |
| --- | --- | --- |
| `src/lib/db/queries/plans.ts` | Reduce to data access and call one read facade | `273-413` |
| `src/features/plans/read-models/detail.ts` | Split aggregation, status snapshot, and DTO mapping | `86-321` |
| `src/features/plans/read-models/summary.ts` | Reuse shared status + completion helpers | `64-199` |
| `src/features/plans/status.ts` | Clarify lifecycle-status API or fold into a named status boundary | `20-65` |
| `src/app/api/v1/plans/[planId]/route.ts` | Consume read facade output directly | `22-47` |
| `src/app/api/v1/plans/[planId]/status/route.ts` | Consume read facade output directly | `24-67` |
| `src/app/plans/[id]/actions.ts` | Consume read facade output directly | `182-207` |
| `src/app/plans/[id]/components/PlanDetailContent.tsx` | Stop remapping detail data multiple times | `22-70` |
| `src/app/plans/components/plan-utils.ts` | Rebase paused/staleness logic on the canonical read status | `113-134` |

**Likely new files**

| File | Purpose |
| --- | --- |
| `src/features/plans/read-service/plan-read-service.ts` | Canonical detail/list/status read boundary |
| `src/features/plans/read-models/detail-aggregate.ts` | Detail aggregation only |
| `src/features/plans/read-models/detail-status.ts` | Detail status snapshot only |
| `src/features/plans/read-models/detail-dto.ts` | Client DTO mapping only |
| `src/features/plans/status/read-status.ts` | Named plan status variants and conversions |

### 3. Implementation Steps (TDD)

1. **Write parity tests first**
   - Add/extend integration coverage around `getLearningPlanDetail()` and `getPlanStatusForUser()` (`tests/integration/db/plans.queries.spec.ts`, `tests/integration/contract/plans.get.spec.ts`, `tests/integration/contract/plans.status-parity.spec.ts`).
   - Add unit tests for status divergence cases so the new boundary makes the semantics explicit instead of hiding them.

2. **Extract a single read facade**
   - Create a facade that returns list/detail/status shapes for app routes and pages.
   - Keep DB query modules focused on fetching rows and ownership checks.

3. **Split `detail.ts` by responsibility**
   - Move aggregation, status derivation, and DTO mapping into separate modules.
   - Reuse shared completion metrics from Slice A rather than letting the new facade reintroduce duplication.

4. **Move consumers**
   - Convert the plan detail API route, status route, page action, and page component to depend on the read facade.
   - Leave UI-only paused/staleness logic in `plan-utils.ts`, but make it depend on the canonical read status instead of re-deriving raw state.

5. **Validate**
   - Re-run contract/integration parity tests plus targeted unit tests for summary/detail status helpers.

### 4. Risk Areas

- **Behavioral change risk:** MEDIUM — status semantics are already layered, and collapsing them carelessly will break UI expectations.
- **Merge conflict risk with Slice A:** MEDIUM — both touch read-model helper files.
- **Merge conflict risk with Slice B:** HIGH — read facades are also the main boundary-cleanup mechanism.
- **Test gap:** detail/page/API parity needs explicit golden coverage before moving multiple consumers at once.

### 5. Estimated Overlap

- **With Slice A:** completion metrics and shared status helpers.
- **With Slice B:** the facade that replaces direct app imports.
- **With Slice E:** client pending-state work depends on the meaning of “ready/failed/processing” staying stable.
- **Merge recommendation:** land after the basic boundary cleanup so the new read facade becomes the architectural destination rather than a temporary adapter.

---

## Slice D — Generation lifecycle consolidation (backend)

### 1. Current State

- `src/app/api/v1/plans/stream/route.ts:59-334` is still more than an HTTP adapter. It parses JSON, rate-limits, opens a stream DB client, creates the plan via `PlanLifecycleService`, resolves model selection, builds generation input, wires SSE response creation, and handles unstructured cleanup failures.
- `src/app/api/v1/plans/[planId]/retry/route.ts:85-223` repeats much of that orchestration with a different preflight path for existing plans.
- `src/features/plans/session/server-session.ts:24-133` wraps stream response creation and RLS DB lifetimes, but it still depends on app-route helper imports from `src/app/api/v1/plans/stream/helpers.ts`.
- `src/app/api/v1/plans/stream/helpers.ts:84-639` mixes concerns:
  - SSE emission and event-shaping (`84-290`, `538-639`)
  - usage-recording side effects (`301-331`)
  - fallback cleanup (`353-410`)
  - fallback error normalization (`442-516`)
  - legacy success/failure handlers (`145-217`) that currently have no external references
- `src/features/plans/lifecycle/service.ts:54-481` already centralizes some lifecycle rules, but `createPlan()`, `createPdfPlan()`, and `processGenerationAttempt()` still carry separate orchestration branches.
- `src/features/ai/orchestrator.ts:383-510` coordinates reservation, timeout setup, provider invocation, stream parsing, pacing, and finalize-success/failure logic in one large flow.
- `src/lib/db/queries/jobs.ts:118-544` mixes queue retry policy, monitoring queries, enqueue/claim/complete/fail mutations, and rate-limit counting.
- `src/lib/db/queries/helpers/attempts-persistence.ts:91-210` mixes normalization, module/task replacement, and attempt finalization inside one transaction helper.

**Gaps / latent issues**

- Stream and retry routes still duplicate stream DB lifecycle and unhandled-error cleanup.
- `stream/helpers.ts` still carries legacy persistence-side-effect helpers next to the newer lifecycle-only SSE path, so the ownership boundary is not obvious yet.
- Queue persistence and generation attempt persistence are already separated at the file level, but each module is still broad enough that future queue/worker changes will cut across multiple unrelated helpers.

### 2. Files to Change

| File | Change | Lines |
| --- | --- | --- |
| `src/app/api/v1/plans/stream/route.ts` | Make HTTP-only; push lifecycle/session logic down | `59-334` |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | Share the same backend lifecycle/session path as stream route | `85-223` |
| `src/features/plans/session/server-session.ts` | Become the main stream-session owner | `24-133` |
| `src/app/api/v1/plans/stream/helpers.ts` | Split emission, fallback cleanup, and legacy persistence helpers | `84-639` |
| `src/features/plans/lifecycle/service.ts` | Introduce clearer origin strategies / lifecycle ownership | `54-481` |
| `src/features/ai/orchestrator.ts` | Extract provider/timeout/failure strategy helpers | `383-510` |
| `src/lib/db/queries/jobs.ts` | Split retry policy, monitoring, and mutations | `118-544` |
| `src/lib/db/queries/helpers/attempts-persistence.ts` | Separate normalization from persistence transaction logic | `91-210` |

**Likely new files**

| File | Purpose |
| --- | --- |
| `src/features/plans/session/plan-generation-session.ts` | Shared create/retry stream orchestration |
| `src/features/plans/session/stream-events.ts` | SSE emission only |
| `src/features/plans/session/stream-cleanup.ts` | Cleanup / safe-failure helpers |
| `src/features/plans/lifecycle/origin-strategies/*.ts` | `ai` vs `pdf` create paths |
| `src/features/ai/orchestrator/select-provider.ts` | Provider selection helper |
| `src/features/ai/orchestrator/failure-classification.ts` | Failure classification helper |
| `src/lib/db/queries/jobs/mutations.ts` | Queue mutations only |
| `src/lib/db/queries/jobs/monitoring.ts` | Queue monitoring/stat queries |

### 3. Implementation Steps (TDD)

1. **Lock backend lifecycle behavior first**
   - Extend `tests/integration/api/plans-stream.spec.ts` and `tests/integration/api/plans-retry.spec.ts` to cover parity between create and retry streaming flows.
   - Extend `tests/integration/db/jobs.queries.spec.ts`, `tests/integration/db/jobs.queue.spec.ts`, `tests/integration/db/attempts-atomic-observability.spec.ts`, and `tests/unit/db/attempts-persistence.spec.ts` before splitting queue/persistence files.
   - Keep `tests/unit/ai/streaming/helpers.spec.ts` and `tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts` green while moving helper ownership.

2. **Centralize shared create/retry session orchestration**
   - Move stream DB acquisition, session response wiring, and unhandled-error cleanup into one feature-owned session module.
   - Reduce both routes to preflight + invocation.

3. **Split `stream/helpers.ts` by runtime concern**
   - Keep SSE event formatting/emission separate from cleanup and persistence fallback logic.
   - Delete or relocate the now-unused legacy success/failure helpers once parity tests prove the lifecycle service owns those side effects.

4. **Narrow lifecycle/orchestrator/queue modules**
   - Extract `ai` vs `pdf` create strategies from `PlanLifecycleService`.
   - Pull timeout/provider/failure helpers out of `orchestrator.ts`.
   - Split jobs query code into mutation vs monitoring paths.
   - Split module normalization from successful-attempt persistence.

5. **Validate**
   - Re-run stream/retry integration tests, queue/attempt persistence tests, and targeted lifecycle unit coverage after each major extraction.

### 4. Risk Areas

- **Regression risk:** HIGH — this slice touches create, retry, usage, persistence, SSE delivery, and queue semantics.
- **Merge conflict risk with Slice B:** HIGH — both want to move session/helper ownership.
- **Merge conflict risk with Slice E:** MEDIUM to HIGH — client generation logic depends on stream event shapes and terminal behavior staying stable.
- **Test gap:** route parity and event-ordering assertions need to stay strong while helpers move.

### 5. Estimated Overlap

- **With Slice B:** `server-session.ts` and stream helper ownership.
- **With Slice E:** stream event shapes, retry semantics, and generation-session boundaries.
- **With Slice F:** parse/request helper work in the same routes.
- **Merge recommendation:** do not start client lifecycle extraction until this backend ownership boundary is clear, because otherwise the client slice will encode today’s accidental API seams.

---

## Slice E — Client lifecycle / UI extraction

### 1. Current State

- `src/features/plans/session/usePlanGenerationSession.ts:129-505` combines:
  - fetch bootstrapping (`154-274`)
  - SSE parsing (`119-127`, `276-494`)
  - React state transitions (`146-152`, `338-418`, `446-458`)
  - cancellation/error shaping (`174-195`, `295-331`)
- `src/hooks/useStreamingPlanGeneration.ts:73-86` and `src/hooks/useRetryGeneration.ts:20-98` are thin wrappers over the same session hook, but each still layers its own flow-control logic.
- `src/hooks/usePlanStatus.ts:54-222` runs a separate polling state machine with backoff, retriable error handling, and stale-state resets.
- `src/app/plans/new/components/ManualCreatePanel.tsx:29-139` builds manual-create payloads and starts generation.
- `src/features/plans/create-mapper.ts:73-131` already maps both onboarding/manual and PDF settings into the same `CreateLearningPlanInput`, but the client flows do not share a common draft/controller model.
- `src/app/plans/new/components/PdfCreatePanel.tsx:114-508` is a large page-state machine that owns upload, extraction, preview, payload mapping, streaming generation, retry/back, and redirect-on-plan-id.
- `src/app/plans/new/components/CreatePlanPageClient.tsx:23-138` coordinates method-switching and topic handoff between PDF and manual paths.
- `src/app/plans/[id]/components/PlanPendingState.tsx:38-214` combines `usePlanStatus()` polling and `useRetryGeneration()` session state in one UI surface.

**Gaps / latent issues**

- The same lifecycle exists in at least four state machines: manual submit, PDF page-state, streaming session, and plan-status polling.
- Retry behavior is split: retrying a failed plan uses `useRetryGeneration()`, while waiting on a pending/processing plan uses `usePlanStatus()`.
- Manual and PDF creation both converge on `CreateLearningPlanInput`, but the draft state and validation live in separate component-local flows.

### 2. Files to Change

| File | Change | Lines |
| --- | --- | --- |
| `src/features/plans/session/usePlanGenerationSession.ts` | Extract SSE reader + reduce hook to state wrapper | `129-505` |
| `src/hooks/useStreamingPlanGeneration.ts` | Rebase on shared controller | `73-86` |
| `src/hooks/useRetryGeneration.ts` | Rebase on shared controller or session abstraction | `20-98` |
| `src/hooks/usePlanStatus.ts` | Coordinate with the shared lifecycle controller instead of standalone polling ownership | `54-222` |
| `src/app/plans/new/components/ManualCreatePanel.tsx` | Use shared plan-creation draft/controller | `29-139` |
| `src/app/plans/new/components/PdfCreatePanel.tsx` | Extract upload/extraction and generation concerns out of the component | `114-508` |
| `src/app/plans/new/components/CreatePlanPageClient.tsx` | Consume shared draft handoff between manual/PDF modes | `23-138` |
| `src/app/plans/[id]/components/PlanPendingState.tsx` | Consume shared lifecycle state rather than stitching retry + polling locally | `38-214` |
| `src/features/plans/create-mapper.ts` | Serve as the mapping layer for a shared draft model | `73-131` |

**Likely new files**

| File | Purpose |
| --- | --- |
| `src/features/plans/session/stream-reader.ts` | Non-React async reader for SSE lines/events |
| `src/features/plans/generation/controller.ts` | Shared client lifecycle controller |
| `src/features/plans/draft/plan-creation-draft.ts` | Shared manual/PDF draft model |
| `src/features/plans/pdf/usePdfExtraction.ts` | PDF extraction/upload hook |

### 3. Implementation Steps (TDD)

1. **Lock existing client lifecycle behavior**
   - Extend `tests/unit/hooks/usePlanStatus.spec.tsx` and `tests/integration/hooks/light/usePlanStatus.test.tsx` for polling/backoff/error behavior.
   - Add hook tests around a new stream-reader abstraction before shrinking `usePlanGenerationSession()`.
   - Keep `tests/unit/mappers/learningPlans.spec.ts` and `tests/e2e/pdf-to-plan.spec.ts` in the loop so manual/PDF mapping and end-to-end behavior stay aligned.

2. **Extract non-React primitives first**
   - Pull SSE parsing into a reusable async reader/generator.
   - Pull PDF extraction network/cancellation logic into `usePdfExtraction()`.

3. **Introduce a shared client controller/draft**
   - Model `extract -> preview -> create/retry -> stream -> poll -> terminal` explicitly.
   - Keep `create-mapper.ts` as the final request-shape layer while centralizing draft state above it.

4. **Thin the components**
   - Shrink `PdfCreatePanel` to view orchestration.
   - Rebase `ManualCreatePanel`, `CreatePlanPageClient`, and `PlanPendingState` on shared controller state/selectors.

5. **Validate**
   - Re-run hook/unit tests plus at least one end-to-end/manual-PDF happy-path check after the controller extraction.

### 4. Risk Areas

- **Behavioral change risk:** MEDIUM to HIGH — this slice changes user-facing loading, retry, and cancellation behavior.
- **Merge conflict risk with Slice D:** HIGH — stream event semantics and retry lifecycle must stabilize first.
- **Shared-state risk:** if the new controller owns too much UI detail, it will become a second monolith.
- **Test gap:** stream-reader and PDF extraction need dedicated unit tests before large component extractions.

### 5. Estimated Overlap

- **With Slice D:** stream event semantics and retry behavior.
- **With Slice C:** the meaning of ready/failed/processing statuses surfaced to the UI.
- **Merge recommendation:** start only after backend lifecycle boundaries are stable; otherwise client abstractions will be built around moving targets.

---

## Slice F — API polish and cleanup

### 1. Current State

- Request-body parsing is repeated across routes with slightly different behavior:
  - `src/app/api/v1/stripe/create-checkout/route.ts:37-49`
  - `src/app/api/v1/stripe/create-portal/route.ts:43-75`
  - `src/app/api/v1/user/profile/route.ts:47-59`
  - `src/app/api/v1/user/preferences/route.ts:86-98`
  - `src/app/api/v1/plans/[planId]/regenerate/route.ts:59-82`
  - `src/app/api/v1/plans/stream/route.ts:68-90`
- The repeated pattern is not perfectly uniform. `create-portal` intentionally allows an empty/missing body and only throws on malformed JSON when the request actually appears to contain JSON (`43-59`), while other routes fail immediately on parse errors.
- `src/features/plans/lifecycle/index.ts:1-64` is an over-broad barrel with duplicated section comments and many exports that do not help the call sites understand ownership.

**Gaps / latent issues**

- A shared `parseJsonBody()` helper cannot be naive; it needs options for “body optional” vs “body required” and should preserve the route-specific validation error shape where needed.
- This slice is low risk structurally, but it overlaps with Slice A if error normalization becomes part of the shared request helper.

### 2. Files to Change

| File | Change | Lines |
| --- | --- | --- |
| `src/app/api/v1/stripe/create-checkout/route.ts` | Replace inline JSON parsing with shared helper | `37-49` |
| `src/app/api/v1/stripe/create-portal/route.ts` | Replace inline JSON parsing while preserving optional-body semantics | `43-75` |
| `src/app/api/v1/user/profile/route.ts` | Replace inline JSON parsing with shared helper | `47-59` |
| `src/app/api/v1/user/preferences/route.ts` | Replace inline JSON parsing with shared helper | `86-98` |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts` | Replace inline JSON parsing with shared helper | `59-82` |
| `src/app/api/v1/plans/stream/route.ts` | Optionally reuse shared helper for malformed JSON handling before Zod parse | `68-90` |
| `src/features/plans/lifecycle/index.ts` | Narrow barrel / remove duplicated section noise | `1-64` |

**Likely new files**

| File | Purpose |
| --- | --- |
| `src/lib/api/parse-json-body.ts` | Shared route JSON parsing helper with required/optional modes |

### 3. Implementation Steps (TDD)

1. **Write route-helper tests first**
   - Add focused unit tests for required vs optional JSON-body parsing, malformed JSON, and empty-body behavior.
   - Use a route matrix so `create-portal` keeps its optional-body behavior while stricter routes keep throwing.

2. **Introduce the shared request helper**
   - Implement `parseJsonBody()` with configurable semantics instead of one hard-coded behavior.
   - Migrate low-risk routes first (profile/preferences/checkout), then the routes with custom handling.

3. **Clean up lifecycle barrel**
   - Narrow exports to what call sites actually need.
   - Remove duplicated section comments and keep the barrel obvious.

4. **Validate**
   - Run targeted route tests and any affected contract/integration route suites after each route migration.

### 4. Risk Areas

- **Behavioral drift:** LOW — mostly cleanup, but `create-portal` is the important exception.
- **Merge conflict risk with Slice D:** MEDIUM — same route files.
- **Merge conflict risk with Slice A:** LOW to MEDIUM if request-helper error normalization gets bundled into the same change.

### 5. Estimated Overlap

- **With Slice D:** `stream/route.ts` and `regenerate/route.ts`.
- **With Slice A:** shared error-normalization helpers if `parseJsonBody()` wants standardized thrown-value handling.
- **Merge recommendation:** leave until the bigger lifecycle/boundary moves land so this stays a cleanup slice instead of creating new rebases.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Slice A
  -> Slice B
    -> Slice C
      -> Slice D
        -> Slice E
          -> Slice F
```

**Rationale**

- **Slice A first** because it extracts pure helpers and lowers cognitive load without forcing architectural decisions.
- **Slice B second** because C and D both need a stable destination for new facades/session ownership.
- **Slice C third** because a single read boundary should settle before deeper lifecycle and UI changes depend on it.
- **Slice D fourth** because backend lifecycle/event ownership needs to stabilize before client-side controller work.
- **Slice E fifth** because the client controller should wrap the final backend lifecycle semantics, not today’s transitional seams.
- **Slice F last** because it is mostly cleanup around routes and a barrel once the bigger abstractions stop moving.

### Shared File Map

| File | Slice A | Slice B | Slice C | Slice D | Slice E | Slice F |
| --- | --- | --- | --- | --- | --- | --- |
| `src/lib/config/env.ts` | ✅ primary | — | — | — | — | — |
| `src/lib/errors.ts` | ✅ primary | — | — | — | — | ✅ helper-adjacent |
| `src/lib/api/error-normalization.ts` | ✅ primary | — | — | — | — | ✅ helper-adjacent |
| `src/features/plans/read-models/detail.ts` | ✅ overlap | — | ✅ primary | — | — | — |
| `src/features/plans/read-models/summary.ts` | ✅ overlap | — | ✅ primary | — | — | — |
| `src/app/plans/components/plan-utils.ts` | ✅ overlap | — | ✅ overlap | — | — | — |
| `src/app/dashboard/components/activity-utils.ts` | ✅ primary | — | — | — | — | — |
| `src/features/plans/session/server-session.ts` | — | ✅ primary | — | ✅ primary | — | — |
| `src/app/api/v1/plans/stream/helpers.ts` | ✅ overlap | ✅ overlap | — | ✅ primary | — | — |
| `src/lib/db/queries/plans.ts` | — | ✅ overlap | ✅ primary | — | — | — |
| `src/app/api/v1/plans/[planId]/route.ts` | — | ✅ overlap | ✅ overlap | — | — | — |
| `src/app/api/v1/plans/[planId]/status/route.ts` | — | ✅ overlap | ✅ overlap | — | — | — |
| `src/app/api/v1/plans/stream/route.ts` | — | — | — | ✅ primary | — | ✅ overlap |
| `src/app/api/v1/plans/[planId]/retry/route.ts` | — | — | — | ✅ primary | — | ✅ overlap |
| `src/features/plans/lifecycle/service.ts` | — | — | — | ✅ primary | — | — |
| `src/features/ai/orchestrator.ts` | — | — | — | ✅ primary | — | — |
| `src/lib/db/queries/jobs.ts` | — | — | — | ✅ primary | — | — |
| `src/features/plans/session/usePlanGenerationSession.ts` | — | — | — | — | ✅ primary | — |
| `src/hooks/usePlanStatus.ts` | — | — | ✅ status-adjacent | — | ✅ primary | — |
| `src/app/plans/new/components/PdfCreatePanel.tsx` | — | — | — | — | ✅ primary | — |
| `src/features/plans/create-mapper.ts` | — | — | — | — | ✅ overlap | — |
| `src/features/plans/lifecycle/index.ts` | — | — | — | — | — | ✅ primary |

### Planning Notes for Slice Agents

- Slice A and Slice C must agree on the destination of shared completion/status helpers before implementation starts.
- Slice B must define the feature-facade destination that Slice C and Slice D can import from; otherwise each slice will invent its own abstraction.
- Slice D should treat the current `stream/helpers.ts` file as transitional and explicitly decide which exports stay route-facing vs move into `src/features/plans/session/`.
- Slice E should assume backend event names stay stable unless Slice D explicitly plans a migration path.

