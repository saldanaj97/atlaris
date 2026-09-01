# Plan Generation Architecture

**Audience:** Developers onboarding to the plan generation pipeline  
**Last Updated:** August 2026

## Overview

Plan generation now begins with `POST /api/v1/plans/stream`.

The stream route creates the plan record, runs generation, and emits SSE events in one request so the client can redirect as soon as the plan id exists without maintaining a separate shell-creation phase.

At runtime, the pipeline combines:

- Clerk Auth for user identity
- request-scoped RLS database access via `getDb()`
- OpenRouter-backed streaming model generation
- strict parsing and pacing before persistence
- generation execution without DB settlement (orchestrator)
- lifecycle generation-finalization: one transaction for attempt + modules/tasks + plan status + usage when applicable

## High-level flow

```text
User submits create form
  → POST /api/v1/plans/stream
  → auth + aiGeneration rate limit
  → validate and normalize input
  → durable generation-window checks
  → create learning_plans row
  → return planId
  → reserve attempt slot
  → call AI provider
  → parse streamed output
  → pace modules/tasks to available hours
  → return unfinalized outcome to lifecycle (orchestrator)
  → lifecycle finalizes attempt, content, plan status, and usage in one DB transaction
  → emit SSE events to client
```

## Request boundary and auth

- API routes use the shared auth wrappers in `@/lib/api/auth`
- request handlers use `getDb()` from `@supabase/runtime`
- the underlying RLS client sets `request.jwt.claims.sub` to the authenticated Clerk user id
- ownership checks then resolve the internal `users.id` row associated with that auth subject

This separation between external auth identity and internal app user row is not optional. It is the basis for RLS ownership checks across plans, attempts, usage, and integration data.

## Main files

### API layer

| File                                                                                  | Responsibility                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `src/app/api/v1/plans/stream/route.ts`                                                | Start streamed plan generation             |
| `src/app/api/v1/plans/stream/helpers.ts`                                              | Stream-side success/failure handling       |
| `src/app/api/v1/plans/[planId]/status/route.ts`                                       | Return plan generation status              |
| `src/app/api/v1/plans/[planId]/attempts/route.ts`                                     | Return attempt history                     |
| `src/app/api/v1/plans/[planId]/retry/route.ts`                                        | Retry a failed or pending-retry generation |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts`                                   | Regenerate an existing plan                |
| `src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/route.ts`   | Start module lesson workflow (async)       |
| `src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/status/route.ts`     | Poll module lesson generation status       |
| `src/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration.ts` | Client generate + status polling hook      |

### AI layer

| File                                                    | Responsibility                            |
| ------------------------------------------------------- | ----------------------------------------- |
| `src/features/ai/orchestrator.ts`                       | Main generation control plane             |
| `src/features/ai/providers/factory.ts`                  | Provider and model selection              |
| `src/features/ai/providers/openrouter.ts`               | OpenRouter transport adapter              |
| `src/features/ai/providers/router.ts`                   | Provider routing and retry behavior       |
| `src/features/ai/providers/mock.ts`                     | Deterministic mock provider               |
| `src/features/ai/parser.ts`                             | Stream parsing and validation             |
| `src/features/ai/pacing.ts`                             | Adjust output to available schedule hours |
| `src/features/ai/classification.ts`                     | Failure classification                    |
| `src/features/ai/timeout.ts`                            | Adaptive timeout policy                   |
| `src/shared/constants/generation.ts`                    | Durable generation-window constants       |
| `src/features/ai/generation-policy.ts`                  | Attempt-cap helpers; re-exports limits    |
| `src/features/plans/lifecycle/generation-finalization/` | Durable settlement after provider run     |

### Database layer

| File                             | Responsibility                                 |
| -------------------------------- | ---------------------------------------------- |
| `src/lib/db/queries/attempts.ts` | Reserve/finalize attempts atomically           |
| `src/lib/db/queries/plans.ts`    | Plan CRUD and access helpers                   |
| `supabase/runtime.ts`            | Request-scoped DB accessor                     |
| `supabase/rls.ts`                | RLS client construction and session state      |
| `supabase/service-role.ts`       | Service-role database client for tests/workers |

## Lifecycle

### 1) Start the stream

`POST /api/v1/plans/stream` creates a new plan (it does not take a plan id). The route performs:

1. authenticated user rate limiting for `aiGeneration` (`requestBoundary.route`)
2. request validation and normalization (`createLearningPlanSchema`)
3. durable generation-window checks (`checkPlanGenerationRateLimit` using `src/shared/constants/generation.ts`)
4. plan-row creation (`lifecycleService.createPlan`)
5. SSE response initialization and session orchestration (attempt reserve, provider run, finalization)

Ownership checks and attempt-cap / status validation apply to retry and other plan-scoped routes, not to create-stream.

The stream route must not couple the plan’s lifecycle to a fragile client connection. Early navigation is common; silent partial failure is worse.

### 2) Run generation execution

Production path: `PlanLifecycleService.processGenerationAttempt` (or `processGenerationAttemptWithReservation`) calls `runGenerationExecution(...)` in `src/features/ai/orchestrator.ts`:

1. reserve an attempt slot (skipped when a reservation is already held)
2. determine timeout budget
3. call the provider with timeout and abort signal
4. parse and validate streamed output
5. classify failures where needed
6. pace modules/tasks to fit available hours
7. return **unfinalized** success or failure (attempt still reserved / in-flight at DB)

Lifecycle settlement owns the single transactional finalize after this returns. Stream wrappers that already reserved must call `settleReservationRejection` instead of `processGenerationAttempt`. Pre-provider reserved failures use `settleReservedAttemptFailure`.

### 3) Finalize in lifecycle (one transaction)

`PlanLifecycleService.processGenerationAttempt` calls `generationFinalization.finalizeSuccess` or `finalizeFailure`. Each method runs **one** DB transaction that settles:

**Success:**

- replace modules/tasks for the plan
- mark `generation_attempts` success
- set `learning_plans` to `ready`, quota-eligible, `finalizedAt`
- insert `ai_usage_events` and increment `usage_metrics.plansGenerated` (`kind: 'plan'`)

**Failure:**

- Attempt/job rows record the failure.
- Last-good plans (`is_quota_eligible = true`, including populated ready plans
  mid-regeneration) stay `ready` and quota-eligible. Modules are not cleared.
- Plans that never owned a cap slot (`is_quota_eligible = false`, including
  first-time generating plans with no usable content) become `failed` and stay
  ineligible, which releases a generating reservation.
- Admission/reservation rejection uses the same plan-row rule (`plan_only`
  finalization does not hide last-good plans from quota accounting).
- Retry of an ineligible plan must reserve a generating slot under the same
  per-user advisory lock as new-plan admission before provider work. Success
  may set `is_quota_eligible = true` only if the plan already owns that slot
  (`is_quota_eligible` or `generation_status = generating`).
- **retryable:** no usage writes (same domain rule as before)
- **permanent with usage:** usage event + metric increment in the same transaction

Low-level `finalizeAttemptSuccess` / `finalizeAttemptFailure` remain **attempt-only** helpers; they do not move the plan row or record usage. Integration tests (`attempts-atomic-observability`) still assert attempt-only success leaves plan `generating` until lifecycle finalization runs.

## Stream contract

The SSE endpoint emits client-safe events such as:

- `plan_start`
- `module_summary`
- `progress`
- `complete`
- `error`

Client-facing errors are sanitized and serialized into the canonical API error shape instead of leaking raw provider or infrastructure failures.

## Failure classes

The generation pipeline uses stable classifications including:

- `timeout`
- `rate_limit`
- `provider_error`
- `validation`
- `capped`

These classifications drive logging, user messaging, and retry decisions.

## Durable workflows

The session boundary (`plan-generation-session.ts`) still reserves the attempt and emits `plan_start` on the SSE connection, then runs provider work and lifecycle finalization inside `planGenerationWorkflow`. The client protocol is unchanged; only backend durability changes.

Workflow run IDs are stored on `generation_attempts.metadata.workflow`. For file layout and correlation, see [Workflow SDK](./workflow-sdk.md).

## Module lesson generation (separate pipeline)

This path is **not** the streamed plan creator. It fills structured lesson content for **one module** in a single provider batch (all tasks in that module), after the plan exists and tasks are laid out.

Production uses a **durable workflow**: the POST handler starts the run and returns quickly; claim, quota, provider work, and persist happen inside workflow steps. The client polls a status endpoint until the module leaves `generating`.

### Entry points

| Method | Path                                                              | Role                                                        |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `POST` | `/api/v1/plans/:planId/modules/:moduleId/lesson-content/generate` | Auth, preflight, start workflow                             |
| `GET`  | `/api/v1/plans/:planId/modules/:moduleId/lesson-content/status`   | Ownership-scoped poll for status + optional `workflowRunId` |

- Handler factory: `createModuleLessonContentGenerateHandler` in `src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/handler.ts`
- Start orchestration: `startModuleLessonGeneration` in `src/features/lesson-content/start-module-lesson-generation-workflow.ts`
- Workflow: `moduleLessonGenerationWorkflow` → `claimModuleLessonGenerationStep` → `runModuleLessonGenerationStep` (`src/features/lesson-content/workflows/`)
- Post-claim work: `runModuleLessonGenerationWork` in `src/features/lesson-content/run-module-lesson-generation-work.ts`
- Client poll: `useModuleLessonGeneration` in `src/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration.ts` (≈2.5s interval, backoff after 20 polls, max interval 60s)

Tests and the POST handler use `startModuleLessonGeneration` (`src/features/lesson-content/start-module-lesson-generation-workflow.ts`): flag fail-closed, preflight, then `workflow/api.start(moduleLessonGenerationWorkflow, …)`. There is no sync `generateModuleLessons` helper.

### Preconditions and guards

- **Ownership:** generate and status routes call `requireOwnedPlanById` before work.
- **Unlock rule:** `loadModuleLessonGenerationContext` sets `isUnlocked: true` when the module exists. Sequential earlier-module completion is not a generate gate, so modules are clickable.
- **Preflight on POST (no DB claim yet):** `classifyModuleLessonGenerationPreflight` returns `not_found` / `locked` (only when a loaded context reports `isUnlocked: false`) / `already_ready` / `in_flight` / `eligible` using the request RLS client. The `locked` branch is not based on earlier-module completion. Eligible requests start the workflow without claiming.
- **Claimable states (inside workflow):** `claimModuleLessonGenerationOrDescribe` CAS-moves `lesson_generation_status` from `not_generated` or `failed` → `generating` and writes `modules.lessonGenerationMetadata.workflow.runId`. Concurrent `generating` → `in_flight`; `ready` → `already_ready`.
- **Feature flag:** Vercel Flag `module-lesson-generation` via `resolveModuleLessonGenerationEnabled()` (`src/flags.ts`, `src/features/lesson-content/generation-flag.ts`). Fail-closed on POST and again inside the workflow step: missing/failed evaluation and disabled both skip provider work (POST returns `disabled` HTTP 503; the step reverts a claimed row when the flag drops mid-run).
- **Rate limit:** generate uses `{ rateLimit: 'lessonGeneration' }` — see `src/lib/api/user-rate-limit.ts` (currently 5 requests per rolling hour per user). Status uses the `read` limiter.
- **Product quota:** none. Lesson generation is not metered as a billing entitlement. `usage_metrics.lesson_modules_generated` remains an observational column (defaults to 0; do not drop). Progressive enqueue generates the first two ordered modules after plan finalization and queues module N+2 after ≥50% completion of module N.

### Execution flow (happy path)

1. POST: ownership + flag + `loadModuleLessonGenerationContext` + preflight.
2. POST: `workflow/api.start(moduleLessonGenerationWorkflow, …)` → return **202** `generating` with `workflowRunId` (or short-circuit `already_ready` / `in_flight` without starting).
3. Workflow claim step (service-role): load context again → `claimModuleLessonGenerationOrDescribe` with the workflow run ID.
4. Workflow run step: re-check flag → entitlement/content access → build prompts (`module-lesson-prompts.ts`) → provider batch + parse → `commitModuleLessonBatchSuccess` (per-task `lesson_content`, module `ready`, usage metadata). No lesson-generation product quota reservation.
5. On provider/parser failure after claim: `commitModuleLessonGenerationFailure` sets module `failed` (`lesson_generation_error` left `NULL`; diagnostics stay in server logs).
6. Client polls GET status until `ready` / `failed` / `not_generated` (after observed generating or matching `workflowRunId`), matching the POST `workflowRunId` before treating a pre-claim rollback as terminal.

### API response shape

Generate JSON matches `ModuleLessonGenerationApiResponseSchema` (`src/shared/schemas/lesson-content.schemas.ts`). Typical HTTP mapping from the start path:

| Result                                             | HTTP    | Notes                                 |
| -------------------------------------------------- | ------- | ------------------------------------- |
| `workflow_started`                                 | **202** | `state: generating` + `workflowRunId` |
| `in_flight`                                        | **202** | `state: generating` (no new run)      |
| `already_ready`                                    | **200** | `state: ready`                        |
| `workflow_start_failed` / provider failure mapping | **502** | `provider_failure`                    |
| `disabled`                                         | **503** | flag off / evaluation failed          |
| `not_found`                                        | **404** |                                       |
| `locked`                                           | **409** | `isUnlocked` false; not order-gated   |

Status JSON matches `ModuleLessonGenerationStatusResponseSchema`: `{ planId, moduleId, status, workflowRunId? }` with `Cache-Control: no-store`.

For correlation and step layout, see [Workflow SDK](./workflow-sdk.md).

### Client polling (status route)

Workflow-backed and concurrent in-flight paths return **HTTP 202** while work continues. The module UI does not wait on a long-lived generate response.

- **Status endpoint:** `GET /api/v1/plans/:planId/modules/:moduleId/lesson-content/status` (`rateLimit: 'read'`).
- **Hook:** `useModuleLessonGeneration` polls that URL while the module is `generating` **or** after the client has requested generation (including immediately after a 202 enqueue, before the DB row is claimed). Interval starts at ≈2.5s, backs off after 20 polls, max 60s.
- **Pre-claim vs post-claim:** `hasObservedGeneratingRef` records whether status (or props) ever showed `generating`. Terminal `not_generated` / `failed` before that observation is treated as queue latency (keep polling); the same terminal states after observation stop polling so claim rollbacks / failures surface correctly.
- **Refresh:** successful terminal polls call `refresh()` so RSC/module props catch up to `ready` or `failed`.

Do not gate polling solely on prop `status === 'generating'` — workflow enqueue can return 202 before the claim is visible to the client.

## Database tables involved

The main persistence path touches:

- `learning_plans`
- `modules`
- `tasks`
- `generation_attempts`
- supporting usage and billing tables where applicable
- module lesson batches additionally update `modules.lesson_generation_*` and `tasks.lesson_content`; provider-started attempts increment `usage_metrics.lesson_modules_generated` as an observational counter without enforcing a lesson-generation quota

See `docs/database/schema-overview.md` for the current schema view.

## RLS model

- request handlers must use `getDb()`
- tests, workers, and system jobs may use the service-role client when appropriate
- RLS session state is configured in `supabase/rls.ts`
- policies check the current auth subject from `request.jwt.claims`
- `users.auth_user_id` maps the auth identity to the internal app user row used by ownership relations

If someone imports the service-role DB into a request handler, they are not being clever. They are bypassing tenancy enforcement.

## Testing guidance

- use mock providers for deterministic unit and integration tests
- test atomic persistence, failure classification, retry behavior, and status transitions
- do not run the full suite when a scoped unit or integration test covers the change

## Related documents

- [Workflow SDK](./workflow-sdk.md) — feature flags, Preview testing (`pnpm deploy:preview`), correlation metadata, and tests
- [Regeneration worker runbook](./regeneration-worker-runbook.md) — queued plan regeneration (`POST .../regenerate`) and workflow-backed drain
- `docs/architecture/auth-and-data-layer.md`
- `docs/api/rate-limiting.md`
- `docs/database/schema-overview.md`
- `supabase/AGENTS.md`
