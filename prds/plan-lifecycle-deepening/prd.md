# PRD: Plan Lifecycle Orchestration — Deep Module Refactor

> Related RFC: [#235 — RFC: deepen plan lifecycle orchestration](https://github.com/saldanaj97/atlaris/issues/235)

## Problem Statement

Creating, generating, and completing a learning plan currently requires callers (route handlers and background workers) to coordinate six separate modules spread across three architectural layers. A route handler that wants to create a plan must:

1. Call `preparePlanCreationPreflight()` to resolve the user's subscription tier, enforce duration caps, check whether the user has a capped plan blocking new attempts, and prepare PDF-origin input if the plan comes from a PDF.
2. Call `insertPlanWithRollback()` to atomically insert the plan row while compensating PDF quota if the insert fails.
3. Call `runGenerationAttempt()` to execute AI generation with adaptive timeout, attempt reservation, and streaming parsing.
4. Call `handleSuccessfulGeneration()` or `handleFailedGeneration()` to mark the plan's status, decide whether usage should be recorded, sanitize errors for the client, and emit SSE events.

The regeneration worker rebuilds this same lifecycle independently, re-resolving the user's tier, selecting a model, calling `runGenerationAttempt()`, and managing job success/failure state.

This creates three categories of friction:

- **Caller complexity**: Route handlers and workers must understand rollback semantics, when to mark success/failure, and how usage accounting interacts with retryability classification. Mistakes in any caller break billing correctness.
- **Integration risk**: The seam between quota reservation (billing), proof verification (PDF security), atomic insertion (billing), and generation completion (stream helpers) is tested by mocking each layer independently. No test exercises the full lifecycle as a single behavior.
- **Navigation difficulty**: Understanding "how a plan gets created" requires reading across `features/plans/api/`, `features/billing/`, `features/ai/`, `features/jobs/`, `lib/db/`, and `app/api/v1/plans/stream/`. The concept is one lifecycle, but ownership is scattered.

> **Note on recent restructuring**: The codebase was reorganized from `src/lib/` into `src/features/` (e.g., `src/lib/stripe/` → `src/features/billing/`, `src/lib/ai/` → `src/features/ai/`, `src/lib/jobs/` → `src/features/jobs/`, `src/lib/api/plans/` → `src/features/plans/api/`). This improved directory-level organization, but the orchestration coupling described above is unchanged — the same cross-module coordination patterns exist at the new paths.

## Solution

Introduce a **PlanLifecycleService** deep module that owns the complete state machine from preflight validation through generation completion. The module exposes a small public interface (two primary methods) and hides tier resolution, quota management, PDF proof verification, rollback compensation, generation invocation, and usage accounting as internal implementation details.

Route handlers and workers become thin entry points that validate input, call the lifecycle service, and translate the result into HTTP/SSE responses or job state updates.

The lifecycle service depends on explicit ports (interfaces) for plan persistence, PDF quota handling, usage recording, generation execution, and job queue interaction. Production wires real adapters; tests wire local or mock adapters so the full lifecycle can be exercised at a single boundary.

## User Stories

1. As a **route handler author**, I want to create a plan by calling a single function with user ID and validated input, so that I don't have to coordinate preflight checks, PDF quota reservation, atomic insertion, and rollback logic myself.
2. As a **route handler author**, I want generation success/failure to be handled by the lifecycle service, so that I don't have to decide when to call `markPlanGenerationSuccess`, `markPlanGenerationFailure`, or `recordUsage`.
3. As a **regeneration worker author**, I want to process a queued regeneration job by calling a single function with the plan ID and job context, so that the worker doesn't duplicate tier resolution, model selection, or failure accounting logic from the route handler.
4. As a **developer modifying quota rules**, I want all quota enforcement (plan limits, PDF plan limits, duration caps) to live inside one module, so that I can change a limit and know it applies consistently to both route-initiated and worker-initiated plans.
5. As a **developer modifying PDF proof logic**, I want PDF quota reservation and rollback to be an internal detail of plan creation, so that I can change the proof verification flow without updating every caller.
6. As a **developer debugging a billing issue**, I want a single module to trace through for the complete plan lifecycle, so that I can understand "why was usage recorded (or not)" without reading six files.
7. As a **test author**, I want to test plan creation and generation completion at a behavioral boundary (lifecycle service input → lifecycle service output), so that my tests survive internal refactors and don't break when I rename an internal helper.
8. As a **test author**, I want to inject mock adapters for generation, PDF quota, and DB persistence into the lifecycle service, so that I can exercise the full lifecycle without a real AI provider.
9. As a **developer adding a new plan origin type** (e.g., template-based), I want to extend plan creation inside the lifecycle service without touching route handlers, so that the route stays thin.
10. As a **developer reading the codebase for the first time**, I want to find "plan creation" in one place, so that I don't have to trace imports across `features/plans/api/`, `features/billing/`, `features/ai/`, `features/jobs/`, and `app/api/v1/plans/stream/` to understand the concept.
11. As a **developer adding idempotency to plan creation**, I want a single place to add idempotency key handling, so that both route and worker callers get idempotent behavior without independent changes.
12. As a **developer investigating a concurrent plan creation race condition**, I want the lifecycle service to encapsulate atomic plan insertion and cap enforcement, so that the fix applies everywhere plans are created.

## Implementation Decisions

### Module to build: PlanLifecycleService

A new deep module under `src/features/plans/` that consolidates plan lifecycle orchestration. This module will:

- **Own the lifecycle state machine**: preflight → reserve quota → insert plan → run generation → mark success/failure → record usage.
- **Expose two primary methods**:
  - `createPlan(params)` — validates input, resolves tier, enforces caps, handles PDF origin preparation (including proof and quota), atomically inserts the plan, and returns the plan ID with a status indicating whether generation was enqueued or started inline.
  - `processGenerationAttempt(params)` — loads the plan, resolves the model, runs generation via the AI orchestrator, marks success or failure, records usage, and returns a structured result with retryability classification.
- **Hide internal orchestration**: Callers never call `preparePlanCreationPreflight`, `insertPlanWithRollback`, `preparePlanInputWithPdfOrigin`, `rollbackPdfUsageIfReserved`, `markPlanGenerationSuccess`, `markPlanGenerationFailure`, or `recordUsage` directly. These become internal implementation details.

### Dependency injection via ports

The lifecycle service depends on explicit port interfaces for its external collaborators:

- **PlanPersistencePort** — atomic plan insertion, plan retrieval, status updates. Production adapter wraps existing Drizzle queries and `atomicCheckAndInsertPlan`.
- **QuotaPort** — tier resolution, plan limit checks, duration cap enforcement, PDF quota reservation/rollback. Production adapter composes `features/billing/tier.ts`, `features/billing/usage-metrics.ts`, and `features/billing/quota.ts` directly.
- **PdfOriginPort** — proof verification, context sanitization, provenance tracking. Production adapter wraps `features/plans/api/pdf-origin.ts` and `features/pdf/security/pdf-extraction-proof.ts`.
- **GenerationPort** — AI generation execution. Production adapter wraps `features/ai/orchestrator.ts`.
- **UsageRecordingPort** — AI token usage recording. Production adapter wraps `lib/db/usage.ts`.
- **JobQueuePort** — regeneration job enqueue/complete/fail. Production adapter wraps `features/jobs/queue.ts`.

This ports & adapters approach means:

- Tests inject in-memory or mock adapters at the port boundary.
- Production wires real adapters once (e.g., in a factory or DI container).
- The lifecycle service itself contains zero direct imports of DB queries, Stripe calls, or AI provider code.

### Caller migration

- **Stream route** (`app/api/v1/plans/stream/route.ts`): Replace the current sequence of `preparePlanCreationPreflight` → `insertPlanWithRollback` → `runGenerationAttempt` → `handleSuccessfulGeneration`/`handleFailedGeneration` with `createPlan()` + `processGenerationAttempt()`. The route retains responsibility for SSE event emission (streaming is a transport concern, not lifecycle).
- **Regeneration worker** (`features/jobs/regeneration-worker.ts`): Replace the current sequence of `resolveUserTier` → `resolveModelForTier` → `runGenerationAttempt` → `completeJob`/`failJob` with `processGenerationAttempt()`. The worker retains responsibility for job queue polling and job state updates.
- **Other plan routes** (retry, regenerate endpoints): Migrate to lifecycle service calls as applicable.

### SSE event emission stays in the route layer

The lifecycle service does not emit SSE events. SSE is a transport-layer concern. The route handler receives structured lifecycle results and translates them into streaming events using the existing `emitModuleSummaries`, `emitSanitizedFailureEvent`, and `buildPlanStartEvent` helpers.

### Error model

The lifecycle service returns discriminated union results (success/retryable failure/permanent failure) instead of throwing. This lets callers make transport-level decisions (retry the job, emit an SSE error, return a 4xx) without catching and inspecting error types.

Quota-related rejections (plan limit reached, PDF quota exceeded, duration cap exceeded) are returned as explicit failure reasons, not thrown exceptions.

### What the recent restructuring already resolved

The move from `src/lib/` to `src/features/` improved directory-level cohesion: billing logic is grouped under `features/billing/`, plan API helpers under `features/plans/api/`, and so on. This means the lifecycle service has cleaner import paths and clearer adapter boundaries than would have existed under the old flat `src/lib/` layout.

However, the restructuring did **not** change the cross-module orchestration pattern — the same functions are called in the same order by the same callers, just at new paths. The lifecycle service refactor addresses the orchestration-level coupling that directory reorganization alone cannot fix.

## Testing Decisions

### What makes a good test for this refactor

Good tests for the lifecycle service:

- Assert **observable behavior at the service boundary** — given specific inputs and adapter states, what result does the service return? What state do adapters observe?
- Do **not** assert internal call sequences (e.g., "markPlanGenerationSuccess was called before recordUsage").
- **Survive internal refactors** — reordering internal steps, renaming internal helpers, or changing how rollback is implemented should not break tests.
- Use **real or local-substitutable adapters** for persistence (test DB) and **mock adapters** for AI generation and external services.

### Modules that will be tested

1. **PlanLifecycleService** (new boundary tests):
   - `createPlan` succeeds for AI-origin input → returns plan ID and status, plan row exists in DB
   - `createPlan` succeeds for PDF-origin input → returns plan ID, PDF quota is decremented
   - `createPlan` with PDF origin rolls back quota when proof verification fails
   - `createPlan` with PDF origin rolls back quota when atomic insert fails
   - `createPlan` rejects when plan cap is reached → returns explicit failure reason
   - `createPlan` rejects when duration cap is exceeded → returns explicit failure reason
   - `processGenerationAttempt` marks plan as ready and records usage on success
   - `processGenerationAttempt` marks plan as failed without recording usage on retryable failure
   - `processGenerationAttempt` marks plan as failed and records usage on permanent failure
   - Concurrent `createPlan` calls respect plan caps (race condition prevention)
   - `processGenerationAttempt` is idempotent for already-finalized plans

2. **Individual adapters** (thin adapter tests verifying wiring):
   - QuotaAdapter correctly delegates to billing usage functions
   - PdfOriginAdapter correctly delegates to PDF proof and context functions
   - GenerationAdapter correctly delegates to AI orchestrator

### Prior art for tests

The existing test suite already contains relevant patterns:

- `tests/integration/plans/plan-limit-race-condition.spec.ts` — exercises `atomicCheckAndInsertPlan` concurrency with real DB. This pattern transfers directly to lifecycle boundary tests.
- `tests/integration/api/plans-stream.spec.ts` — exercises the stream route end-to-end with a mock orchestrator. The lifecycle service tests should follow this pattern of injecting a mock generation adapter.
- `tests/integration/api/regeneration-worker-process.spec.ts` — exercises the regeneration worker with real DB. This pattern transfers to lifecycle boundary tests for the worker path.
- `tests/unit/ai/streaming/helpers.spec.ts` — exercises SSE helpers by mocking `markPlanGenerationSuccess/Failure` and `recordUsage`. These mock-heavy tests can be replaced by lifecycle boundary tests once the service exists.

### Tests to eventually retire

Once the lifecycle service boundary tests are comprehensive:

- The mock-sequencing assertions in `tests/unit/ai/streaming/helpers.spec.ts` that verify the order of `markPlanGenerationSuccess` / `markPlanGenerationFailure` / `recordUsage` calls. These test implementation details that should be hidden inside the lifecycle service.
- Any tests that mock `preparePlanCreationPreflight` or `insertPlanWithRollback` in isolation, since the lifecycle service subsumes that orchestration.

## Out of Scope

- **Changing the SSE streaming transport**: The lifecycle service does not own SSE emission. The existing streaming helpers remain the route layer's responsibility.
- **Changing the AI orchestrator internals**: The AI orchestrator (`features/ai/orchestrator.ts`) keeps its current interface. The lifecycle service treats it as a port dependency.
- **Changing the job queue implementation**: The job queue (`features/jobs/`) keeps its current interface. The lifecycle service calls it through a port.
- **Changing subscription tier definitions or billing logic**: Tier limits, Stripe integration, and subscription management remain in `features/billing/`. The lifecycle service reads tier data but does not own tier definitions.
- **Schema or migration changes**: No database schema changes are required. The lifecycle service operates over existing tables through existing query functions.
- **PDF extraction or security changes**: PDF text extraction, malware scanning, and proof token cryptography remain in `features/pdf/`. The lifecycle service calls them through a port.
- **UI or client-side changes**: This is a backend architectural refactor with no client-facing API changes. The SSE event format, HTTP response shapes, and API contracts remain identical.

## Further Notes

- **Incremental migration**: The lifecycle service can be introduced behind a feature flag or as an opt-in path. Existing route handlers and workers can migrate one at a time. The old direct-call pattern can coexist during the transition.
- **Adapter granularity**: Start with coarse adapters (one per feature boundary). If testing reveals that finer-grained ports are needed, split them later. Over-abstracting upfront adds complexity without proven value.
- **Observability**: The lifecycle service should log structured events at each state transition (preflight passed, quota reserved, plan inserted, generation started, generation completed) using the existing pino logger. This replaces the current scattered logging across multiple modules with consistent lifecycle-scoped log entries.
- **Performance**: No performance impact is expected. The lifecycle service is a coordination layer, not a compute layer. All heavy work (DB queries, AI generation, PDF extraction) is delegated to existing implementations through ports.
