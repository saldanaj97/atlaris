# Plan: Deepen Regeneration Orchestration Boundary

Issue: https://github.com/saldanaj97/atlaris/issues/309

## Summary

Issue 309 asks for a deeper regeneration orchestration boundary. The current route and worker split one app workflow across HTTP, queue, quota, retry, lifecycle, and inline-processing modules. This plan introduces a boundary that owns the app-level intent to regenerate a plan and the queued execution semantics, while leaving routes focused on HTTP/auth and leaving AI/provider behavior behind the existing lifecycle seams.

This is a behavior-preserving refactor. No new feature flags, no schema migration, no API response shape changes. Every outcome currently observable from the route (status codes, headers, JSON body) and the worker (job table state transitions, retry scheduling, inline-drain timing) must remain byte-identical.

## Folder Disambiguation

- `.plans/309-rfc-deepen-regeneration-orchestration-boundary/` (this folder) is the active plan for issue 309.
- `.plans/309-deepen-request-boundary/` is **completed, unrelated** request-auth/DB boundary work that happens to share a stale folder prefix. Leave that folder untouched. Do not read it for this task.

## Current State (validated against source)

- `src/app/api/v1/plans/[planId]/regenerate/route.ts` exports a single `POST: PlainHandler` wrapped in `withErrorBoundary(withAuthAndRateLimit(...))`. It owns: `regenerationQueueEnv.enabled` gate, `requirePlanIdFromRequest`, `requireOwnedPlanById`, JSON body parse + `planRegenerationRequestSchema`, `getActiveRegenerationJob` dedupe, plan-generation rate-limit check + response header attachment, `resolveUserTier` + `computeJobPriority`/`isPriorityTopic`, `runRegenerationQuotaReserved` wrapping `enqueueJobWithResult`, inline drain decision + `registerInlineDrain`/`tryAcquireInlineDrainLock`, and HTTP outcome mapping (202 / 409 / 429 / 503).
- `src/features/jobs/regeneration-worker.ts` exports `tryAcquireInlineDrainLock`, `registerInlineDrain`, `waitForInlineRegenerationDrains`, `drainRegenerationQueue`. It owns: module-scoped `PlanLifecycleService`, `planRegenerationJobPayloadSchema` (file-private Zod), `getNextJob`, plan load + combined missing/wrong-owner failure, `resolveUserTier`, `buildGenerationInput` with override merge, `processGenerationAttempt` invocation, success/retryable/permanent/already-finalized mapping, `shouldRetryJob` + retry decision logging, `completeJob`/`failJob`, drain loop, inline-drain lock/registry/wait helpers.
- `src/features/billing/regeneration-quota-boundary.ts` already exposes `runRegenerationQuotaReserved<T>(args, deps?)` with `RegenerationQuotaWorkResult<T>` (`consumed` | `revert`). This is the stable quota seam. Keep it as a boundary dependency; do not re-home it.
- `src/features/jobs/queue.ts` is intentionally a thin service-role queue wrapper (`enqueueJob`, `enqueueJobWithResult`, `getNextJob`, `completeJob`, `failJob`, `getUserJobCount`). Do not turn it into business orchestration.
- `src/features/plans/retry-policy.ts` exports `shouldRetryJob`, `getRetryDelay`, `computeEffectiveMaxAttempts`, plus retry constants. Call from the boundary; do not inline.
- `src/features/plans/lifecycle/index.ts` exports `createPlanLifecycleService`, `PlanLifecycleService`, `isRetryableClassification`, plus port types (`GenerationPort`, `JobQueuePort`, `PlanPersistencePort`, `QuotaPort`, `UsageRecordingPort`) and result types (`GenerationAttemptResult`, `GenerationSuccess`, `RetryableFailure`, `PermanentFailure`, `AlreadyFinalized`, etc.). These are the delegation surface the boundary uses; do not reach past them.
- Inline drain: only `regeneration-worker.ts` owns `tryAcquireInlineDrainLock` / `registerInlineDrain` / `waitForInlineRegenerationDrains`. Call sites today are the regenerate route and `src/app/api/internal/jobs/regeneration/process/route.ts`.
- Queue-enabled guard: `regenerationQueueEnv.enabled` from `src/lib/config/env/queue.ts`. There is no `isQueueEnabled` function; keep reading the env object.
- Request Zod: `planRegenerationRequestSchema` in `src/features/plans/validation/learningPlans.ts` (uses `planRegenerationOverridesSchema` from `learningPlans.schemas.ts`). Job-payload Zod is duplicated privately in the worker; the boundary will own the canonical job-payload schema and the worker parse becomes a boundary call.

## Non-Goals

- No DB schema migration.
- No UI changes to `RegenerateButton` or its tests beyond boundary-mock updates.
- No provider/model selection changes.
- No lifecycle rewrite outside the surface needed to call `processGenerationAttempt`.
- No generalized queue abstraction beyond plan regeneration.
- No new feature flags, no shadow mode, no toggles. Refactor ships in one PR.
- No change to HTTP status codes, response bodies, or response headers of the regenerate route.
- No change to job table state transitions or retry timing.

## Acceptance Criteria (authoritative for implementor)

1. `src/app/api/v1/plans/[planId]/regenerate/route.ts` contains only: `withErrorBoundary` + `withAuthAndRateLimit` wrappers, plan id extraction, body parse + `planRegenerationRequestSchema`, plan-generation rate-limit check + response header attachment, a single call into the boundary, and outcome-to-HTTP mapping. No direct calls to `getActiveRegenerationJob`, `resolveUserTier`, `computeJobPriority`, `runRegenerationQuotaReserved`, `enqueueJobWithResult`, `registerInlineDrain`, or `tryAcquireInlineDrainLock` from the route.
2. `src/features/jobs/regeneration-worker.ts` contains only: drain loop (`drainRegenerationQueue`), inline-drain primitives (`tryAcquireInlineDrainLock`, `registerInlineDrain`, `waitForInlineRegenerationDrains`), and a thin call into the boundary for per-job execution. No direct calls to `planRegenerationJobPayloadSchema`, `getActiveRegenerationJob`, plan-load queries, `resolveUserTier`, `buildGenerationInput`, lifecycle `processGenerationAttempt`, `shouldRetryJob`, `completeJob`, or `failJob` from the worker.
3. A new package `src/features/plans/regeneration-orchestration/` exports two public operations and nothing else wider than necessary (see "Public API Contract").
4. `runRegenerationQuotaReserved` remains the quota seam and is called from inside the boundary with identical compensation/reconciliation semantics. `RegenerationQuotaWorkResult` `consumed`/`revert` mapping is preserved.
5. Combined missing-plan / wrong-owner failure behavior is preserved (no case-enumeration leak).
6. Inline-drain behavior preserved: on successful enqueue, if `inlineProcessingEnabled` and `tryAcquireInlineDrainLock()` returns true, the boundary schedules exactly one drain and registers the promise via `registerInlineDrain`.
7. Boundary behavior is covered by focused boundary tests; route tests are slimmed to HTTP/auth/preflight/response mapping; worker tests are slimmed to drain-loop + inline-drain primitives.
8. Validation: targeted specs + `pnpm test:changed` + `pnpm check:full` pass.
9. Issue 309 closure PR includes the evidence table from "Issue Verification & Closure".

## Step 0.0 — Confirm Scope

1. Re-read the issue: `gh issue view 309 --repo saldanaj97/atlaris --json number,title,body,labels,state,url`.
2. Confirm this folder (`.plans/309-rfc-deepen-regeneration-orchestration-boundary/`) is the active plan and the stale `.plans/309-deepen-request-boundary/` is untouched.
3. No other discovery work is required. The "Current State" section above is the ground truth.

## Step 1.0 — Create Boundary Package

**Decision (not open):** boundary lives at `src/features/plans/regeneration-orchestration/` because this is plan-domain orchestration, not queue infrastructure. `src/features/jobs/` stays the thin queue wrapper layer.

**Decision (not open):** `runRegenerationQuotaReserved` stays in `src/features/billing/regeneration-quota-boundary.ts` and is consumed as an injected dependency. Do not move it.

### Files to create

- `src/features/plans/regeneration-orchestration/index.ts` — public barrel. Exports only: `requestPlanRegeneration`, `processNextPlanRegenerationJob`, `processPlanRegenerationJob`, public types listed below, and `createDefaultRegenerationOrchestrationDeps`.
- `src/features/plans/regeneration-orchestration/types.ts` — public types (see "Public API Contract").
- `src/features/plans/regeneration-orchestration/deps.ts` — `RegenerationOrchestrationDeps` interface + `createDefaultRegenerationOrchestrationDeps(dbClient)` factory wiring real implementations.
- `src/features/plans/regeneration-orchestration/request.ts` — implements `requestPlanRegeneration`.
- `src/features/plans/regeneration-orchestration/process.ts` — implements `processNextPlanRegenerationJob` and `processPlanRegenerationJob`.
- `src/features/plans/regeneration-orchestration/schema.ts` — canonical `planRegenerationJobPayloadSchema` (Zod) used by the boundary; replaces the duplicated private copy in the worker.
- `tests/unit/features/plans/regeneration-orchestration/request.spec.ts`
- `tests/unit/features/plans/regeneration-orchestration/process.spec.ts`

### Public API Contract

All types are exported from `src/features/plans/regeneration-orchestration/types.ts`. No Drizzle types cross the boundary.

```ts
export type PlanRegenerationOverrides = z.infer<
  typeof planRegenerationOverridesSchema
>;

export type RequestPlanRegenerationArgs = {
  userId: string;
  planId: string;
  overrides?: PlanRegenerationOverrides;
  /** Set by the route. When true the boundary may schedule an inline drain on successful enqueue. */
  inlineProcessingEnabled: boolean;
};

export type RequestPlanRegenerationResult =
  | { kind: 'queue-disabled' }
  | {
      kind: 'enqueued';
      jobId: string;
      planId: string;
      status: 'pending';
      /** True if the boundary scheduled an inline drain. Route uses this only for response headers/telemetry; drain is already scheduled. */
      inlineDrainScheduled: boolean;
    }
  | { kind: 'plan-not-found' }
  | { kind: 'active-job-conflict'; existingJobId: string }
  | { kind: 'queue-dedupe-conflict'; existingJobId: string }
  | {
      kind: 'quota-denied';
      retryAfterSeconds?: number;
      reason: string;
    }
  | {
      kind: 'compensation-failed';
      jobId?: string;
      reason: string;
    };

export async function requestPlanRegeneration(
  args: RequestPlanRegenerationArgs,
  deps?: RegenerationOrchestrationDeps,
): Promise<RequestPlanRegenerationResult>;
```

```ts
export type ProcessPlanRegenerationJobResult =
  | { kind: 'no-job' }
  | { kind: 'completed'; jobId: string; planId: string }
  | { kind: 'retryable-failure'; jobId: string; planId: string; willRetry: boolean }
  | { kind: 'permanent-failure'; jobId: string; planId: string }
  | { kind: 'already-finalized'; jobId: string; planId: string }
  | { kind: 'plan-not-found-or-unauthorized'; jobId: string; planId: string }
  | { kind: 'invalid-payload'; jobId: string };

export async function processNextPlanRegenerationJob(
  deps?: RegenerationOrchestrationDeps,
): Promise<ProcessPlanRegenerationJobResult>;

export async function processPlanRegenerationJob(
  job: Job, // imported from @/features/jobs/types — NOT a Drizzle row
  deps?: RegenerationOrchestrationDeps,
): Promise<ProcessPlanRegenerationJobResult>;
```

### Dependency Injection Contract

```ts
export interface RegenerationOrchestrationDeps {
  dbClient: DbClient;
  queue: {
    enabled: () => boolean; // reads regenerationQueueEnv.enabled
    enqueueWithResult: typeof enqueueJobWithResult;
    getNextJob: typeof getNextJob;
    completeJob: typeof completeJob;
    failJob: typeof failJob;
  };
  quota: {
    runReserved: typeof runRegenerationQuotaReserved;
  };
  plans: {
    getActiveRegenerationJob: (planId: string, userId: string, dbClient: DbClient) => Promise<{ id: string } | null>;
    requireOwnedPlan: (planId: string, userId: string, dbClient: DbClient) => Promise<Plan | null>;
  };
  tier: {
    resolveUserTier: typeof resolveUserTier;
  };
  priority: {
    computeJobPriority: typeof computeJobPriority;
    isPriorityTopic: typeof isPriorityTopic;
  };
  lifecycle: {
    service: PlanLifecycleService;
  };
  retry: {
    shouldRetryJob: typeof shouldRetryJob;
  };
  inlineDrain: {
    tryAcquireLock: typeof tryAcquireInlineDrainLock;
    register: typeof registerInlineDrain;
    drain: () => Promise<unknown>; // wraps drainRegenerationQueue({ maxJobs: <config> })
  };
  logger: Pick<typeof logger, 'info' | 'error' | 'warn'>;
}

export function createDefaultRegenerationOrchestrationDeps(
  dbClient: DbClient,
): RegenerationOrchestrationDeps;
```

Consumers (route, worker, tests) pass `deps` when overriding, otherwise call the operation without deps and the implementation builds defaults via `createDefaultRegenerationOrchestrationDeps(await getDb())`.

## Step 2.0 — Move Enqueue Orchestration Out of Route

### Boundary owns (inside `requestPlanRegeneration`)

1. `deps.queue.enabled()` guard → `queue-disabled` outcome.
2. `deps.plans.requireOwnedPlan(planId, userId)` → `plan-not-found` outcome on null (route already authenticated; boundary only checks ownership/existence).
3. `deps.plans.getActiveRegenerationJob` → `active-job-conflict`.
4. `deps.tier.resolveUserTier` + `deps.priority.computeJobPriority({ tier, isPriorityTopic: deps.priority.isPriorityTopic(plan.topic) })`.
5. `deps.quota.runReserved({ userId, planId, dbClient, work })` where `work()`:
   - calls `deps.queue.enqueueWithResult(JOB_TYPES.PLAN_REGENERATION, planId, userId, { planId, overrides }, priority)`;
   - maps `queued` → `{ disposition: 'consumed', value: { jobId } }`;
   - maps `dedup` → `{ disposition: 'revert', value: { existingJobId }, reason: 'queue-dedupe', jobId: existingJobId }`;
   - rethrows on unexpected queue errors so `runReserved` runs compensation.
6. Map `runReserved` result → final `RequestPlanRegenerationResult`:
   - `consumed` → `enqueued` (see inline drain step below);
   - `revert` with `queue-dedupe` → `queue-dedupe-conflict`;
   - reservation refusal → `quota-denied`;
   - compensation-thrown path → `compensation-failed`.
7. Inline drain decision: if result is `enqueued` and `args.inlineProcessingEnabled` and `deps.inlineDrain.tryAcquireLock()` returns true, compute `const drainPromise = deps.inlineDrain.drain()`, attach a `.catch(err => deps.logger.error(...))` identical to today's shape, and `deps.inlineDrain.register(drainPromise)`. Return `inlineDrainScheduled: true`. Otherwise `inlineDrainScheduled: false`. The route must not touch these primitives.

### Route keeps

1. `withErrorBoundary(withAuthAndRateLimit(...))` wrapper.
2. `requirePlanIdFromRequest` for `planId` extraction.
3. JSON body parse + `planRegenerationRequestSchema` for `overrides` parsing and 400 mapping.
4. Plan-generation rate-limit check + response header attachment (this is HTTP semantics; rate-limit headers only make sense at the HTTP layer).
5. Single call: `const result = await requestPlanRegeneration({ userId, planId, overrides, inlineProcessingEnabled })`.
6. Outcome → HTTP mapping:
   - `queue-disabled` → 503 with existing body.
   - `plan-not-found` → 404 with existing body.
   - `active-job-conflict` / `queue-dedupe-conflict` → 409 with existing body + `existingJobId`.
   - `quota-denied` → 429 with existing headers/body (use `retryAfterSeconds` if the current route does).
   - `compensation-failed` → 500 with existing reconciliation telemetry body (match current error shape exactly).
   - `enqueued` → 202 with `{ planId, jobId, status: 'pending' }`.

### Things the route must stop importing

- `getActiveRegenerationJob`, `resolveUserTier`, `computeJobPriority`, `isPriorityTopic`, `runRegenerationQuotaReserved`, `enqueueJobWithResult`, `tryAcquireInlineDrainLock`, `registerInlineDrain`, `drainRegenerationQueue`.

## Step 3.0 — Move Job Execution Semantics Out of Worker

### Boundary owns (inside `processPlanRegenerationJob`)

1. Payload validation with the canonical `planRegenerationJobPayloadSchema` exported from `regeneration-orchestration/schema.ts`. Invalid payload → `invalid-payload` outcome after `deps.queue.failJob(job.id, ..., { retryable: false })`.
2. Plan load + same-owner security check. Combine missing-plan and wrong-owner into a single `plan-not-found-or-unauthorized` outcome; do not branch error messages. After emitting the single combined failure, call `deps.queue.failJob(job.id, ..., { retryable: false })`.
3. Override merge via `buildGenerationInput` (existing helper); preserve explicit `null` date clearing and notes semantics exactly.
4. `deps.tier.resolveUserTier(userId, dbClient)`.
5. `deps.lifecycle.service.processGenerationAttempt(input)` → switch on `GenerationAttemptResult`:
   - `generation_success` → `deps.queue.completeJob(job.id, { moduleCount, taskCount, ... })`, return `completed`.
   - `retryable_failure` → `shouldRetryJob` decision → `deps.queue.failJob(..., { retryable: <decision.shouldRetry> })`, log retry decision with identical structured fields, return `retryable-failure` with `willRetry`.
   - `permanent_failure` → `deps.queue.failJob(..., { retryable: false })`, return `permanent-failure`.
   - `already_finalized` → idempotent `deps.queue.completeJob` (or no-op matching today's behavior), return `already-finalized`.

### Boundary also owns

- `processNextPlanRegenerationJob`: `const job = await deps.queue.getNextJob([JOB_TYPES.PLAN_REGENERATION])`; if null, return `no-job`; else return `processPlanRegenerationJob(job, deps)`.

### Worker keeps

1. `drainRegenerationQueue({ maxJobs?, processNextJob? })` — unchanged public shape. `DrainRegenerationQueueOptions.processNextJob` seam stays for tests; default is `() => processNextPlanRegenerationJob()` imported from the boundary. `DrainRegenerationQueueResult` shape (`processedCount`, `completedCount`, `failedCount`) unchanged; counting is derived from the boundary's `ProcessPlanRegenerationJobResult.kind`.
2. Inline-drain primitives: `tryAcquireInlineDrainLock`, `registerInlineDrain`, `waitForInlineRegenerationDrains`. These stay here because they are process-singleton primitives, not orchestration.
3. Module-scoped `PlanLifecycleService` can move into the boundary's default-deps factory. The worker file no longer instantiates it directly.

### Things the worker must stop importing

- `planRegenerationJobPayloadSchema` (local copy deleted; boundary owns it), `resolveUserTier`, `buildGenerationInput`, `processGenerationAttempt` direct call (goes through boundary), `shouldRetryJob`, `completeJob`, `failJob`, `getNextJob`.

## Step 4.0 — Tests

### Boundary tests (new)

Add `tests/unit/features/plans/regeneration-orchestration/request.spec.ts` covering:

- queue-disabled → `queue-disabled` outcome.
- enqueue success (fake queue, fake quota) → `enqueued` with `jobId` and `inlineDrainScheduled: true` when lock acquired.
- enqueue success with `inlineProcessingEnabled: false` → `enqueued` with `inlineDrainScheduled: false`, `register` not called.
- enqueue success with lock already held → `inlineDrainScheduled: false`.
- active job present → `active-job-conflict`, no enqueue, no quota reservation.
- queue dedupe → `queue-dedupe-conflict`, quota reserved then reverted (assert `compensate` called once).
- quota denial → `quota-denied`, no enqueue.
- compensation throws → `compensation-failed` with reconciliation telemetry recorded (assert `reportReconciliation` called).
- plan ownership missing → `plan-not-found` without enumeration leak (single message/telemetry path shared with wrong-owner case).

Add `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` covering:

- no job → `no-job`.
- invalid payload → `failJob(retryable: false)`, `invalid-payload`.
- missing plan → combined `plan-not-found-or-unauthorized`, `failJob(retryable: false)`.
- wrong-owner plan → same combined outcome, same telemetry (assert messages identical to missing-plan case).
- override merge preserves explicit `null` date clearing.
- override merge preserves notes semantics.
- lifecycle `generation_success` → `completeJob` with module/task counts, `completed`.
- lifecycle `retryable_failure` with attempts left → `failJob(retryable: true)`, retry decision logged, `willRetry: true`.
- lifecycle `retryable_failure` at cap → `failJob(retryable: false)`, `willRetry: false`.
- lifecycle `permanent_failure` → `failJob(retryable: false)`, `permanent-failure`.
- lifecycle `already_finalized` → idempotent completion, `already-finalized`.

Use DB via testcontainers only for tests that need real plan rows and ownership checks (process-side plan-load + ownership cases). Use in-memory fakes for queue/quota/lifecycle in pure unit tests. Do not stand up a real queue — `enqueueJobWithResult`/`getNextJob` are injected.

### Route tests (slim)

`tests/integration/api/plans.regenerate.spec.ts` keeps:

- auth/rate-limit wrapper behavior;
- malformed JSON → 400;
- invalid `overrides` → 400;
- `planId` extraction / invalid id → 400;
- each boundary outcome → expected HTTP status/body/headers (mock `requestPlanRegeneration` to return each `kind` exactly once; assert mapping).

Delete or move assertions about quota, dedupe internals, priority calculation, inline-drain scheduling, plan-load internals out of this file and into the boundary specs.

### Worker tests (slim)

`tests/unit/jobs/regeneration-worker.spec.ts` keeps: drain loop counting, `maxJobs` behavior, `processNextJob` seam override, exception-in-processNextJob handling.

`tests/unit/jobs/regeneration-worker-inline-drain.spec.ts` unchanged — still tests the primitives.

Move payload/plan/lifecycle/retry/complete/fail assertions out of worker tests into the boundary `process.spec.ts`.

### Existing coverage to preserve

- `tests/unit/features/billing/regeneration-quota-boundary.spec.ts` — unchanged, still tests the quota seam.
- `tests/unit/components/RegenerateButton.spec.tsx` — unchanged.
- `tests/integration/api/regeneration-worker-process.spec.ts` — update to go through the boundary via the process route; behavior assertions unchanged.

## Step 5.0 — Validation

1. `pnpm test` on the new boundary spec files directly.
2. `pnpm test` on each touched integration spec individually:
   - `tests/integration/api/plans.regenerate.spec.ts`
   - `tests/integration/api/regeneration-worker-process.spec.ts`
   - `tests/integration/db/jobs.queue.spec.ts` only if queue-wrapper imports changed (they should not).
3. `pnpm test:changed`.
4. `pnpm check:full`.

All four must pass with no skipped tests beyond those already skipped on `develop`.

## Step 6.0 — Issue Verification & Closure

Before closing issue 309, append the following evidence table to `todos.md` Review. Each cell must contain a concrete file path plus line numbers:

| Acceptance Criterion | Evidence |
| --- | --- |
| AC1: route reduced to HTTP/auth preflight + mapping | `src/app/api/v1/plans/[planId]/regenerate/route.ts:Lx-Ly` |
| AC2: worker reduced to drain + inline primitives | `src/features/jobs/regeneration-worker.ts:Lx-Ly` |
| AC3: boundary package exists with declared public surface | `src/features/plans/regeneration-orchestration/index.ts:Lx-Ly` |
| AC4: quota seam preserved and called from boundary | `src/features/plans/regeneration-orchestration/request.ts:Lx-Ly` |
| AC5: combined missing/wrong-owner failure preserved | `src/features/plans/regeneration-orchestration/process.ts:Lx-Ly` |
| AC6: inline-drain decision + scheduling preserved | `src/features/plans/regeneration-orchestration/request.ts:Lx-Ly` |
| AC7: boundary tests exist and cover enumerated cases | `tests/unit/features/plans/regeneration-orchestration/*.spec.ts` |
| AC8: validation passed | `pnpm test:changed` + `pnpm check:full` output excerpts |

## Risks & Mitigations

- **Quota compensation regression.** If `work()` throws instead of returning `{ disposition: 'revert' }` on queue dedupe, `runRegenerationQuotaReserved` will run compensation twice. Mitigation: dedupe always returns `revert` from `work()`; unit test asserts `compensate` called exactly once in dedupe path.
- **Security-leak regression.** Splitting missing-plan and wrong-owner into separate outcomes would leak plan existence. Mitigation: single `plan-not-found-or-unauthorized` outcome; test asserts identical messages/telemetry for both cases.
- **Inline-drain unhandled rejection.** Vitest traps unhandled rejections. Mitigation: keep `const p = deps.inlineDrain.drain(); p.catch(err => logger.error(...)); deps.inlineDrain.register(p);` in this exact order; spec asserts no unhandled rejection.
- **Test coverage drift.** Route tests currently assert orchestration internals; slimming them risks losing coverage. Mitigation: every assertion removed from route tests must have a corresponding new assertion in `request.spec.ts` or `process.spec.ts`. Reviewer checks this in Step 6 evidence table.
- **Default-deps resolution order.** `createDefaultRegenerationOrchestrationDeps` must be called lazily (per-request) to pick up `await getDb()` correctly, not at module load. Mitigation: default-deps factory is a function, not a module-scoped singleton; boundary operations call it when `deps` arg is omitted.
- **`DrainRegenerationQueueOptions.processNextJob` seam.** Must keep default binding to the boundary's `processNextPlanRegenerationJob`. Mitigation: unit-test default binding.

## Security Review Checklist

- [ ] Auth stays in `withAuthAndRateLimit`; boundary never authenticates.
- [ ] Plan ownership check happens inside boundary before any work.
- [ ] Missing-plan and wrong-owner collapse to a single outcome with identical telemetry.
- [ ] No Drizzle query-builder types exported from the boundary.
- [ ] No service-role DB access in the boundary beyond what `deps.dbClient` already provides (same as today).
- [ ] Rate-limit headers remain attached at the route; boundary does not produce HTTP headers.
- [ ] Inline-drain `logger.error` structured fields unchanged: `planId`, `userId`, `error`, `inlineProcessingEnabled`, `drainFn`.
- [ ] Sentry reconciliation telemetry (`recordBillingReconciliationRequired`) still fires on compensation failure.

## Out of Scope Explicitly

- Renaming `regeneration-quota-boundary`.
- Generalizing boundary beyond plan regeneration (e.g. plan creation).
- Replacing `runRegenerationQuotaReserved` default deps.
- Changing retry constants.
- Adding new telemetry fields.

## Rollout

Single PR. No feature flag. Refactor is behavior-preserving; if validation passes, ship. If a reviewer requests splitting, split along Step boundaries (Step 2 and Step 3 are independently mergeable once Step 1 lands).
