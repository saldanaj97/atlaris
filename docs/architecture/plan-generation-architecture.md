# Plan Generation Architecture

**Audience:** Developers onboarding to the plan generation pipeline  
**Last Updated:** October 2026

## Overview

Plan generation starts with `POST /api/v1/plans` (create) or `POST /api/v1/plans/:planId/retry` (retry). The request creates the plan (create only), reserves a generation attempt, hands the attempt to the jobs Worker, and returns `202 { planId, attemptId }`. Generation never runs on the request. The client opens the plan page, which polls `GET /api/v1/plans/:planId/status` until the plan is `ready` or `failed`.

At runtime, the pipeline combines:

- Clerk Auth for user identity
- request-scoped RLS database access via `getDb()`
- a Cloudflare Workflow instance per attempt on the jobs Worker
- OpenRouter-backed streaming model generation
- strict parsing and pacing before persistence
- generation execution without DB settlement (orchestrator)
- lifecycle generation-finalization: one transaction for attempt + modules/tasks + plan status + usage when applicable

## High-level flow

```text
User submits create form
  → POST /api/v1/plans
  → auth + aiGeneration rate limit
  → validate and normalize input
  → durable generation-window checks
  → create learning_plans row
  → reserve attempt slot
  → start the attempt: signed POST /v1/plan-generation/start to the jobs Worker
  → 202 { planId, attemptId }; client navigates to /plans/:planId
  → (Worker) call AI provider → parse → pace → lifecycle finalizes attempt, content, plan status, and usage in one transaction
  → plan page polls GET /api/v1/plans/:planId/status until ready or failed
```

## Request boundary and auth

- API routes use the shared auth wrappers in `@/lib/api/auth`
- request handlers use `getDb()` from `@supabase/runtime`
- the underlying RLS client sets `request.jwt.claims.sub` to the authenticated Clerk user id
- ownership checks then resolve the internal `users.id` row associated with that auth subject

This separation between external auth identity and internal app user row is not optional. It is the basis for RLS ownership checks across plans, attempts, usage, and integration data.

## Main files

### API layer

| File                                                                                  | Responsibility                                                       |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/api/v1/plans/route.ts`                                                       | `POST`: create a plan and start its first attempt (202); `GET`: list |
| `src/app/api/v1/plans/[planId]/retry/route.ts`                                        | Retry a failed or pending-retry generation (202)                     |
| `src/app/api/v1/plans/[planId]/status/route.ts`                                       | Return plan generation status (polled by the plan page)              |
| `src/app/api/v1/plans/[planId]/attempts/route.ts`                                     | Return attempt history                                               |
| `src/app/api/v1/plans/[planId]/regenerate/route.ts`                                   | Regenerate an existing plan                                          |
| `src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/route.ts`   | Start module lesson workflow (async)                                 |
| `src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/status/route.ts`     | Poll module lesson generation status                                 |
| `src/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration.ts` | Client generate + status polling hook                                |

### Session and start

| File                                                       | Responsibility                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/features/plans/session/plan-generation-session.ts`    | Session boundary: `startCreate` / `startRetry`, error mapping                |
| `src/features/plans/start-plan-generation-attempt.ts`      | Reserve the attempt and hand it to the jobs Worker; settle when not started  |
| `src/features/jobs/plan-generation-dispatch.ts`            | Signed `POST /v1/plan-generation/start` to the jobs Worker; never throws     |
| `src/features/plans/session/usePlanGenerationSession.ts`   | Client create/retry request (`starting` → `started` on 202)                  |
| `src/app/(app)/plans/[id]/components/PlanPendingState.tsx` | Plan page: status polling (`usePlanStatus`) and retry (`useRetryGeneration`) |

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

| File                             | Responsibility                                                        |
| -------------------------------- | --------------------------------------------------------------------- |
| `src/lib/db/queries/attempts.ts` | Reserve attempts and expose transaction-scoped persistence primitives |
| `src/lib/db/queries/plans.ts`    | Plan CRUD and access helpers                                          |
| `supabase/runtime.ts`            | Request-scoped DB accessor                                            |
| `supabase/rls.ts`                | RLS client construction and session state                             |
| `supabase/service-role.ts`       | Service-role database client for tests/workers                        |

## Lifecycle

### 1) Start the attempt

`POST /api/v1/plans` creates a new plan (it does not take a plan id). The route and session boundary perform:

1. authenticated user rate limiting for `aiGeneration` (`requestBoundary.route`)
2. request validation and normalization (`parseCreatePlanRequest`, `createLearningPlanSchema`)
3. durable generation-window checks (`checkPlanGenerationRateLimit` using `src/shared/constants/generation.ts`)
4. plan-row creation (`lifecycleService.createPlan`)
5. attempt reservation (`reserveAttemptSlot`)
6. the Worker start (`startPlanGenerationAttempt`), then `202 { planId, attemptId }` with the generation-window rate-limit headers

`POST /api/v1/plans/:planId/retry` runs the same steps, except that steps 2 and 4 become ownership and status checks: only `failed` and `pending_retry` plans may retry (`400 VALIDATION_ERROR` otherwise), and the reservation re-checks those statuses inside its transaction.

| Start outcome                                                                                                  | Settlement                                                                                    | Response                                                            |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| The Worker answered `202` or `200 duplicate`                                                                   | None; the Worker owns the attempt                                                             | `202 { planId, attemptId }`                                         |
| Reservation rejected (cap, concurrent attempt, status changed)                                                 | `settleReservationRejection`                                                                  | Status from `PLAN_CREATION_FAILURE_HTTP_MAP` for the classification |
| Worker `503 jobs_paused` / `job_disabled`; any other Worker non-2xx, timeout, network error, or missing config | `settleReservedAttemptFailure` as a retryable `provider_error` (the plan leaves `generating`) | `503 GENERATION_FAILED`                                             |
| Unexpected error after the plan exists                                                                         | The plan is marked failed (`onUnhandledError`)                                                | `503 GENERATION_FAILED`                                             |

Every not-started response uses the canonical error shape `{ error, code, classification, details: { planId, retryable } }`. `error` and `code` come from the classification's failure presentation (`getFailurePresentation`). `details.planId` lets the client open the plan page with "Generation failed. You can retry from the plan page.".

The request returns as soon as the Worker accepts the command. A Workflow instance that throws after it started is settled by its `fail` step right away; the Worker's stuck-plan cleanup (`cleanupStuckPlans`, every 15 minutes) is the backstop.

### 2) Run generation execution

Production path: `PlanLifecycleService.processGenerationAttempt` (or `processGenerationAttemptWithReservation`) calls `runGenerationExecution(...)` in `src/features/ai/orchestrator.ts`:

1. reserve an attempt slot (skipped when a reservation is already held)
2. determine timeout budget
3. call the provider with timeout and abort signal
4. parse and validate streamed output
5. classify failures where needed
6. pace modules/tasks to fit available hours
7. return **unfinalized** success or failure (attempt still reserved / in-flight at DB)

Lifecycle settlement owns the single transactional finalize after this returns. Start paths that already reserved (`startPlanGenerationAttempt`) must call `settleReservationRejection` instead of `processGenerationAttempt`. Pre-provider reserved failures use `settleReservedAttemptFailure`.

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

The lifecycle finalization store owns the success and failure transactions. The database layer exposes `reserveAttemptSlot`, `persistSuccessfulAttemptInTx`, and `persistFailedAttemptInTx` as transaction-scoped primitives; integration tests exercise the lifecycle commit so attempt, plan, module/task, and usage state settle together.

## Status polling

- **Client start.** `usePlanGenerationSession` POSTs the create or retry request and resolves on `202`. For create, `useStartAiPlanGeneration` shows "Your learning plan generation has started." and navigates to the plan. For retry, `useRetryGeneration` calls `usePlanStatus().restart()` when the server accepts: the poller of a `failed` plan is terminal, so `restart` resumes polling and reads `processing` until the first response. It then refreshes the route so server-rendered attempt counts catch up.
- **Status route.** `GET /api/v1/plans/:planId/status` derives `status` with `derivePlanReadStatus`. A `generating` plan reads `processing` while its latest attempt is `in_progress`, even when that attempt is the last one the cap allows; without that, the final retry would read `failed` while it runs. `latestError` is the classification presentation message for a `failed` plan.
- **Terminal states.** `ready` refreshes the page into the plan view; `failed` shows the failure panel with `latestError` and the retry action while attempts remain.

## Failure classes

The generation pipeline uses stable classifications including:

- `timeout`
- `rate_limit`
- `provider_error`
- `validation`
- `capped`

These classifications drive logging, user messaging, and retry decisions.

## Durable workflows

Plan create and retry attempts always run on the jobs Worker. The app sends the signed `POST /v1/plan-generation/start` through `dispatchPlanGenerationToWorker`, and the Worker runs the Cloudflare Workflow `PlanGenerationWorkflow`. There is no runtime switch and no Vercel Workflow path for create and retry. Plan **regeneration** is separate: it runs through a Cloudflare Queue consumer on the same Worker (see [Regeneration worker runbook](./regeneration-worker-runbook.md)); it has no Workflow instance.

Workflow run IDs are stored on `generation_attempts.metadata.workflow`. To trace a run, read that row and look up the Cloudflare instance ID in the Cloudflare Workflows dashboard or Workers Logs.

### Cloudflare Workflow path (B6)

The jobs Worker (`workers/jobs`) runs plan create/retry generation as the Cloudflare Workflow `PlanGenerationWorkflow` (`atlaris-plan-generation-<env>`, binding `PLAN_GENERATION_WORKFLOW`). Design: [Cloudflare Workers job runtime](./cloudflare-jobs-runtime.md), Decisions 4, 6, 7, and 9.

**Start.** Signed `POST /v1/plan-generation/start` with `{ v: 1, ...PlanGenerationWorkflowInput }` (`planGenerationStartCommandSchema`, `src/lib/jobs-worker/contract.ts`): `planId`, `userId`, `tier`, `input`, `generationPurpose` (`initial` only), `modelOverride`, `correlationId`, the reservation from `toSerializableReservation`, and the optional `allowedGenerationStatuses` / `requiredGenerationStatus`. The app reserves the attempt first (`startPlanGenerationAttempt`) and sends the command through `dispatchPlanGenerationToWorker`: one attempt, 10-second timeout, no retry (Decision 4). Responses: `202 { accepted, instanceId }`, `200 { accepted, duplicate: true }` when the instance already exists, `400` invalid body, `401` bad signature, `503 { code: "jobs_paused" | "job_disabled" }`, `503 { code: "workflow_start_failed" }`. Handler: `workers/jobs/src/http/plan-generation-start.ts`. Instance ID: `plan-<attemptId>`.

**Steps** (`workers/jobs/src/workflows/plan-generation/run.ts`). Names are final once deployed; never rename, reorder, or remove them.

| Step              | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Retries                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `record-workflow` | `mergeAttemptWorkflowMetadata` writes `{ provider: 'cloudflare-workflow', runId: <instanceId>, startedAt }` to `generation_attempts.metadata.workflow`.                                                                                                                                                                                                                                                                                                       | 3, exponential                    |
| `generate`        | Switch off → stop before the provider (`disabled`). Otherwise `PlanLifecycleService.runGenerationWithReservation`, the provider half of a generation attempt: replay check (an attempt already `success` or `failure` ends the run), OpenRouter call under the adaptive timeout, parse, pace. Provider and parse failures come back classified. Returns the paced modules, provider metadata, and usage. Step timeout: AI base + extension timeout plus 60 s. | 0 (never repeats a provider call) |
| `finalize`        | `PlanLifecycleService.settleGenerationResult`, the settlement half: `finalizeSuccess` / `finalizeFailure` in one transaction with usage exactly as today, then the first two modules' lessons start through `createWorkflowModuleLessonStarter` (the lessons Workflow). A `disabled` run settles the attempt as a retryable `provider_error` (Decision 7). A retry first repeats the replay check and stops if its commit landed.                             | 2 (transient DB only)             |
| `fail`            | Runs after any thrown step. Unless the attempt is already finalized, settles it as a retryable `provider_error`.                                                                                                                                                                                                                                                                                                                                              | 3                                 |

Parse failures are never retried: invalid JSON settles as a retryable `provider_error` and a schema failure as a permanent `validation` failure with usage, the app's standard classification and messaging. Each step opens its own database pool (`withStepDb`); Worker paths never use the service-role singleton. Each step execution writes one log line `{ job: "plan-generation", step, instanceId, planId, attemptId, outcome, errorKind?, taskCount? }` for per-step CPU measurement (Decision 9).

**Runtime marker.** `generation_attempts.metadata.workflow.provider` is `cloudflare-workflow` for create and retry (`cloudflare-queue` for regeneration attempts, `workflow-sdk` on older rows); `runId` is the Cloudflare instance ID, the queue message ID for regeneration, or the Vercel run ID on older rows. Settlement passes the marker back as `workflowMetadata`, so the finalized attempt keeps it with `completedAt`.

**Settings.** Worker switch `JOB_PLAN_GENERATION_ENABLED` (Worker secret; off unless `true`) and `JOBS_PAUSED`; lessons after success also need `JOB_MODULE_LESSONS_ENABLED`. Secrets: `JOBS_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_PLAN_PRESET`. The step timeout follows the Worker's `AI_TIMEOUT_*` variables (app defaults when unset).

**Availability.** The app needs `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET`, and the Worker needs `JOB_PLAN_GENERATION_ENABLED=true`. When the Worker is paused, the switch is off, or the command fails, the start settles the reserved attempt as a retryable `provider_error` and the request returns `503 GENERATION_FAILED`.

## Module lesson generation (separate pipeline)

This path is **not** the streamed plan creator. It fills structured lesson content for **one module** in a single provider batch (all tasks in that module), after the plan exists and tasks are laid out.

Production uses a **durable workflow on the jobs Worker**: the POST handler runs load/preflight, then a service-role **provisional claim** before the signed `POST /v1/module-lessons/start`, and returns quickly. On start failure the start helper reverts that claim. The Workflow's claim step attaches `workflow.runId` (or describes a concurrent outcome). Provider work and persist happen inside Workflow steps. The client polls a status endpoint until the module leaves `generating`.

### Entry points

| Method | Path                                                              | Role                                                        |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `POST` | `/api/v1/plans/:planId/modules/:moduleId/lesson-content/generate` | Auth, preflight, provisional claim, start Worker workflow   |
| `GET`  | `/api/v1/plans/:planId/modules/:moduleId/lesson-content/status`   | Ownership-scoped poll for status + optional `workflowRunId` |

- Handler factory: `createModuleLessonContentGenerateHandler` in `src/app/api/v1/plans/[planId]/modules/[moduleId]/lesson-content/generate/handler.ts`
- Start orchestration: `startModuleLessonGeneration` in `src/features/lesson-content/start-module-lesson-generation-workflow.ts`
- Workflow: `ModuleLessonsWorkflow` on the jobs Worker (`workers/jobs/src/workflows/module-lessons/run.ts`)
- Shared domain phases and `runModuleLessonGenerationWork`: `src/features/lesson-content/run-module-lesson-generation-work.ts`
- Client poll: `useModuleLessonGeneration` in `src/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration.ts` (≈2.5s interval, backoff after 20 polls, max interval 60s)

Tests and the POST handler use `startModuleLessonGeneration` (`src/features/lesson-content/start-module-lesson-generation-workflow.ts`): flag fail-closed; `loadModuleLessonGenerationContext(params.dbClient, …)` + `classifyModuleLessonGenerationPreflight`; service-role provisional `claimModuleLessonGenerationOrDescribe` (`deps.dbClient ?? serviceRoleDb`; the generate handler does not pass `deps.dbClient`); then `dispatchModuleLessonsToWorker`. A refused or failed command reverts the provisional claim via `revertModuleLessonGeneratingToNotGenerated`. Preflight `already_ready` / `in_flight` / `locked` / `not_found`, or claim `already_ready` / `in_flight` / `not_found`, return without starting. There is no sync `generateModuleLessons` helper.

### Preconditions and guards

- **Ownership:** generate and status routes call `requireOwnedPlanById` before work.
- **Unlock rule:** `loadModuleLessonGenerationContext` sets `isUnlocked: true` when the module exists. Sequential earlier-module completion is not a generate gate, so modules are clickable.
- **Preflight on POST:** `loadModuleLessonGenerationContext(params.dbClient, …)` then `classifyModuleLessonGenerationPreflight` returns `not_found` / `locked` (only when a loaded context reports `isUnlocked: false`) / `already_ready` / `in_flight` / `eligible` using the request RLS client. The `locked` branch is not based on earlier-module completion. Non-`eligible` results return immediately — no claim and no Worker command.
- **Provisional claim (start helper, before the Worker command):** `claimModuleLessonGenerationOrDescribe` on `deps.dbClient ?? serviceRoleDb` CAS-moves `lesson_generation_status` from `not_generated` or `failed` → `generating` and writes `batchRequestId` (no `workflow.runId` yet). Concurrent `generating` → `in_flight`; `ready` → `already_ready`; missing owned ready plan → `not_found`. Those kinds return without starting.
- **Workflow-step claim:** the Worker's `claim` step reloads and calls `claimModuleLessonGenerationOrDescribe` again with `{ batchRequestId, workflow: { provider: 'cloudflare-workflow', runId, startedAt } }`, which attaches `modules.lessonGenerationMetadata.workflow.runId` on the already-`generating` row (or CAS-claims if still claimable).
- **Feature flag:** Vercel Flag `module-lesson-generation` via `resolveModuleLessonGenerationEnabled()` (`src/flags.ts`, `src/features/lesson-content/generation-flag.ts`). Fail-closed on POST: missing/failed evaluation and disabled both skip provider work (POST returns `disabled` HTTP 503). The Worker's own `JOB_MODULE_LESSONS_ENABLED` switch is re-checked in its steps and reverts a claimed row when it drops mid-run.
- **Rate limit:** generate uses `{ rateLimit: 'lessonGeneration' }` — see `src/lib/api/user-rate-limit.ts` (currently 5 requests per rolling hour per user). Status uses the `read` limiter.
- **Product quota:** none. Lesson generation is not metered as a billing entitlement. `usage_metrics.lesson_modules_generated` remains an observational column (defaults to 0; do not drop). Progressive enqueue generates the first two ordered modules after plan finalization and queues module N+2 after ≥50% completion of module N.

### Execution flow (happy path)

1. POST: `requestBoundary` + ownership + `startModuleLessonGeneration({ dbClient: db, … })` (`params.dbClient` is the request RLS client).
2. Start helper: flag fail-closed → load (`params.dbClient`) → preflight. Non-`eligible` (`already_ready` / `in_flight` / `locked` / `not_found`) return without claiming or starting.
3. Eligible: service-role provisional claim (`batchRequestId` only). Non-`claimed` returns that kind without starting.
4. `dispatchModuleLessonsToWorker`. On `disabled` or `failed`: `revertModuleLessonGeneratingToNotGenerated` (`batchRequestId`) → `disabled` or `workflow_start_failed` (handler maps to **503** / **502**). On acceptance: **202** `generating` with `workflowRunId` (the instance ID). A Workflow that fails later settles through its `fail` step.
5. Workflow claim step: load context again → preflight short-circuits → `claimModuleLessonGenerationOrDescribe` with `{ batchRequestId, workflow: { runId, startedAt } }`.
6. Workflow `generate` and `parse-commit` steps: re-check the switch → entitlement/content access → build prompts (`module-lesson-prompts.ts`) → provider batch + parse (`parse-module-lesson-batch.ts`: the task count must match; lessons map to tasks by position in DB order, echoed task ids that match no task are repaired and counted in a `repairedTaskIdCount` warn log, and an id naming another task rejects the batch) → `commitModuleLessonBatchSuccess` (per-task `lesson_content`, module `ready`, usage metadata). No lesson-generation product quota reservation.
7. On provider/parser failure after claim: `commitModuleLessonGenerationFailure` sets module `failed` (`lesson_generation_error` left `NULL`; diagnostics stay in server logs).
8. Client polls GET status until `ready` / `failed` / `not_generated` (after observed generating or matching `workflowRunId`), matching the POST `workflowRunId` before treating a reverted `not_generated` as terminal.

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

For correlation, read `modules.lessonGenerationMetadata.workflow.runId` (the Cloudflare instance ID) and look it up in the Cloudflare Workflows dashboard or Workers Logs.

### Cloudflare Workflow path (B5)

The jobs Worker (`workers/jobs`) runs generation as the Cloudflare Workflow `ModuleLessonsWorkflow` (`atlaris-module-lessons-<env>`, binding `MODULE_LESSONS_WORKFLOW`). The app always starts it through the Worker (see **App routing** below). Design: [Cloudflare Workers job runtime](./cloudflare-jobs-runtime.md), Decisions 4, 6, 7, and 9.

**Starts.**

- **Signed command:** `POST /v1/module-lessons/start` with `{ v: 1, planId, moduleId, userId, batchRequestId, correlationId, modelOverride? }` (`moduleLessonsStartCommandSchema`, `src/lib/jobs-worker/contract.ts`), signed like every jobs command. The app makes the provisional claim first; the Workflow adopts it. Responses: `202 { accepted, instanceId }`, `200 { accepted, duplicate: true }` when the instance already exists and is live (or its status is unreadable) or has completed with a `success` outcome, `400` invalid body, `401` bad signature, `503 { code: "jobs_paused" | "job_disabled" }`, `503 { code: "workflow_start_failed" }` (also when the existing instance ended without success: `errored`, `terminated`, or `complete` with another outcome, so the app reverts the claim). Handler: `workers/jobs/src/http/module-lessons-start.ts`.
- **Regeneration consumer:** `createWorkflowModuleLessonStarter` (`workers/jobs/src/jobs/regeneration-consumer.ts`) calls `startModuleLessonGeneration` with the invocation's database client and the Worker switch, and creates the instance directly through an injected `dispatch` (no HTTP hop). A thrown create reports `duplicate` for a live or successfully completed existing instance, and `failed` (which reverts the provisional claim) otherwise.
- **Instance ID:** `lessons-<moduleId>-<batchRequestId>`, or `lessons-<moduleId>-<first 32 hex of SHA-256(batchRequestId)>` when the batch ID has other characters or the ID would pass 100 characters (`workers/jobs/src/workflows/module-lessons/instance-id.ts`).

**App routing.** `startModuleLessonGeneration` keeps the flag check, preflight, and provisional claim (`batchRequestId = correlationId`), then calls `dispatchModuleLessonsToWorker` (`src/features/jobs/module-lessons-dispatch.ts`), so the generate route and progressive enqueue both follow it:

| Worker answer                                                                      | Start result                               | Generate route                        | Claim                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | ----------------------------------- |
| `202 { instanceId }`                                                               | `workflow_started` (`runId` = instance ID) | 202 `generating` with `workflowRunId` | Kept; the Workflow adopts it        |
| `200 { duplicate: true }`                                                          | `in_flight`                                | 202 `generating`                      | Kept; the existing instance owns it |
| `503 jobs_paused` / `job_disabled`                                                 | `disabled`                                 | 503 `disabled`                        | Reverted                            |
| Other non-2xx, timeout, network, missing `JOBS_WORKER_URL` / `JOBS_SIGNING_SECRET` | `workflow_start_failed`                    | 502 `provider_failure`                | Reverted                            |

One attempt, 10-second timeout, no retry (Decision 4).

**Steps** (`workers/jobs/src/workflows/module-lessons/run.ts`). Names are final once deployed; never rename, reorder, or remove them.

| Step                 | Work                                                                                                                                                                                                                                                                                                                                                                          | Retries                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `claim`              | Load context; switch off → revert the claim and stop; preflight (`not_found` / `locked` / `already_ready` stop); content access (not full → revert, `failed`); `claimModuleLessonGenerationOrDescribe` with `workflow: { provider: 'cloudflare-workflow', runId: <instanceId>, startedAt }`, which adopts the app's provisional claim. Returns the prompt input.              | 3, exponential                    |
| `generate`           | Switch off → revert and stop; resolve the lesson model; `markModuleLessonProviderStarted`; OpenRouter call; buffer the stream (≤ `MAX_RAW_RESPONSE_CHARS`). Returns `{ rawText, usage, finishReason }`; the step log carries `finishReason`. Step timeout: AI base + extension timeout plus 60 s.                                                                             | 0 (never repeats a provider call) |
| `parse-commit`       | `parseModuleLessonBatchText`, then `commitModuleLessonBatchSuccess`. A `ParserError` is returned, not thrown: `invalid_json` (empty or malformed) and `validation` (wrong task count, schema) run the retry steps; `invalid_input` (a caller bug) throws `NonRetryableError`. A retry that finds the module already `ready` under this instance stops without a second write. | 2 (transient DB only)             |
| `generate-retry`     | Runs once, only after a retryable parse failure. Same work and prompt as `generate`; the provider-start marker is a no-op on this call, so the module's quota counts once. Usage from the failed first call is not recorded.                                                                                                                                                  | 0 (never repeats a provider call) |
| `parse-commit-retry` | Same as `parse-commit`, but any `ParserError` throws `NonRetryableError`, which runs `fail`.                                                                                                                                                                                                                                                                                  | 2 (transient DB only)             |
| `fail`               | Runs after any thrown step. After `claim`: revert. Later: only while this instance owns the `generating` row, `recordModuleLessonGenerationFailure` (module `failed`; revert instead when that write fails and the provider never started).                                                                                                                                   | 3                                 |

**Grounded lessons (JCS-160).** When the user's tier has `GROUNDED_GENERATION_<TIER>=true`, `claim` also returns `grounded: { tier, pickedModelId, research }`, and the run writes one lesson per call instead of `generate`. With the switch off (the default), or on a claim cached before this shipped, the steps above run unchanged. Code: `workers/jobs/src/workflows/module-lessons/grounded.ts`, `src/features/lesson-content/grounded-lesson-{prompt,writer}.ts`, `lesson-citation-checks.ts`.

| Step               | Work                                                                                                                                                                                                                                                                                                                                                                                                                                         | Retries                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `lesson-<n>`       | One lesson (1-based task order). Switch off → revert and stop; `markModuleLessonProviderStarted` (a no-op after the first lesson); OpenRouter call with the lesson preset, the 1b writer route (free tier: the pinned allowlist as fallbacks) and `prompt_cache_key` = plan ID; parse; derive `sourceIds`; citation checks. Lessons run in parallel, at most 2 (free), 4 (starter) or 6 (pro) at once; after a failure no new lesson starts. | 0 (never repeats a provider call) |
| `lesson-<n>-retry` | Runs once, only after a retryable parse or citation failure of that lesson. A second failure throws `NonRetryableError`, which runs `fail`.                                                                                                                                                                                                                                                                                                  | 0                                 |
| `parse-commit`     | All lessons committed together, as the batch path does, with token and cost totals summed into one usage row.                                                                                                                                                                                                                                                                                                                                | 2 (transient DB only)             |

Prompt parts, in cache order after the preset's system prompt: the research brief with its `[Sn]` source list and citation rules (cached; omitted with no brief), the module outline (cached; adds a no-citations rule with no brief), an uncached regeneration-reason slot (the plan's stored `regeneration_reasons` and `regeneration_note`, rendered by `buildRegenerationGuidance`; empty when there are none), then the lesson task. Every lesson in a module shares the cached prefix. Lessons cite the plan's latest `plan_research` run; a missing run, a `failed_skipped` run or one with no sources counts as no brief. Citation checks (`checkLessonCitations`): every cited key is one of the plan's sources (`unknown_source`), no raw URLs (`raw_url`), and no citations without a brief (`citation_without_brief`).

Each step opens its own database pool (`withInvocationDb`); Worker paths never use the service-role singleton. The domain phases it calls (`checkModuleLessonGenerationGate`, `resolveModuleLessonProvider`, `generateModuleLessonRawBatch`, `persistModuleLessonBatch`, `recordModuleLessonGenerationFailure`) are the same ones `runModuleLessonGenerationWork` composes in one call.

**Runtime marker.** `modules.lessonGenerationMetadata.workflow.provider` is `cloudflare-workflow` (`workflow-sdk` on rows written before the Vercel path was retired); `runId` is the Cloudflare instance ID. The status route returns `runId` as `workflowRunId`.

**Settings.** Worker switch `JOB_MODULE_LESSONS_ENABLED` (Worker secret; off unless `true`) and `JOBS_PAUSED`. Secrets: `JOBS_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_LESSON_PRESET`. The app's Vercel Flag `module-lesson-generation` does not reach the Worker.

**Availability.** The app needs `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET`, and the Worker needs `JOB_MODULE_LESSONS_ENABLED=true`. Record CPU per step from Workers Logs (Decision 9).

### Client polling (status route)

Worker-backed and concurrent in-flight paths return **HTTP 202** while work continues. The module UI does not wait on a long-lived generate response.

- **Status endpoint:** `GET /api/v1/plans/:planId/modules/:moduleId/lesson-content/status` (`rateLimit: 'read'`).
- **Hook:** `useModuleLessonGeneration` polls that URL while the module is `generating` **or** after the client has requested generation (including immediately after a 202, when the start helper has already provisionally claimed). Interval starts at ≈2.5s, backs off after 20 polls, max 60s.
- **Observed generating vs revert:** `hasObservedGeneratingRef` records whether status (or props) ever showed `generating`. Terminal `not_generated` / `failed` before that observation is treated as queue/read latency (keep polling); the same terminal states after observation, or a status `workflowRunId` that matches the POST run, stop polling so claim reverts / failures surface correctly.
- **Refresh:** successful terminal polls call `refresh()` so RSC/module props catch up to `ready` or `failed`.

Do not gate polling solely on prop `status === 'generating'` — a 202 can return while RSC/module props still show `not_generated`.

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

- [Cloudflare Workers job runtime](./cloudflare-jobs-runtime.md) — Worker design, Workflows, and Queue
- [Regeneration worker runbook](./regeneration-worker-runbook.md) — queued plan regeneration (`POST .../regenerate`) on the Cloudflare Queue
- `docs/architecture/auth-and-data-layer.md`
- `docs/api/rate-limiting.md`
- `docs/database/schema-overview.md`
- `supabase/AGENTS.md`
