# Queue: avoid duplicate decideJobRetry

## Issue

GitHub issue: https://github.com/saldanaj97/atlaris/issues/316

`applyRetryableFailure` currently asks `decideJobRetry` what will happen, logs that answer, then calls `failJob`. `failJob` delegates to `failJobRecord`, which calls `decideJobRetry` again inside the queue mutation. That makes the queue write and orchestration result depend on two separate policy evaluations for the same failure path.

Acceptance criteria from the issue:

- `decideJobRetry` is not evaluated twice for the same failure path unless explicitly documented and tested.
- `willRetry` and log fields stay consistent with the row written to `job_queue`, including attempt number and cap semantics.
- Targeted regeneration orchestration unit tests plus queue retry-path coverage still pass, with no regression on `scheduledFor` backoff.

## Current State

Primary code anchors:

- `src/features/plans/regeneration-orchestration/process.ts:186` has `applyRetryableFailure`.
- `src/features/plans/regeneration-orchestration/process.ts:191` calls `deps.retry.decideJobRetry` using `job.attempts + 1`.
- `src/features/plans/regeneration-orchestration/process.ts:207` then calls `deps.queue.failJob(..., { retryable: true })`.
- `src/lib/db/queries/jobs/mutations.ts:184` has `failJobRecord`.
- `src/lib/db/queries/jobs/mutations.ts:195` calls `decideJobRetry` again from the locked current row.
- `src/lib/db/queries/jobs/mutations.ts:215` uses `decision.delayMs` to set `scheduledFor`.
- `src/features/jobs/queue.ts:71` exposes `failJob` as the worker-facing service-role wrapper.
- `src/shared/retry-policy.ts:38` owns `decideJobRetry`.

Existing tests already cover important slices:

- `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` checks retryable orchestration result, logging, and `failJob` call shape.
- `tests/integration/db/jobs.queue.spec.ts` checks retry transitions, terminal failure, `retryable: false`, custom max attempts, and `scheduledFor` backoff via `getJobRetryDelayMs`.
- `tests/unit/shared/retry-policy.spec.ts` covers the pure policy itself.

## Proposed Approach

Make the persisted queue mutation the authoritative retry outcome for regeneration orchestration.

1. Remove the retry-policy preflight from `applyRetryableFailure`.
2. Call `deps.queue.failJob` first.
3. Derive `willRetry` from the returned job row: `updatedJob?.status === 'pending'`.
4. Log fields from the returned row, not from a second policy decision. Include `jobId`, `classification`, `error`, `attemptNumber`, `maxAttempts`, `willRetry`, and `scheduledFor` when present.
5. Remove `retry` from `RegenerationOrchestrationDeps` if no other orchestration path needs it.
6. Keep `failJobRecord` as the single owner of retry policy execution and backoff scheduling.

This is the narrowest fix. It avoids changing queue semantics, does not add a second queue result type, and handles stale input better than the current implementation because the orchestration result follows the locked row that was actually written.

## Alternatives Rejected

- Return `{ job, decision }` from `failJob`: more explicit, but it changes the queue API shape across all current callers for little gain. The row already contains the user-facing outcome needed by orchestration.
- Keep duplicate policy calls and document them: easy but weak. It preserves the exact risk the issue exists to remove.
- Inject `decideJobRetry` into `failJob` from orchestration: moves the duplication around and weakens the persistence boundary.

## Implementation Steps

### Step 0.0 - Confirm Scope

Re-read issue #316, confirm no existing `.plans/316-*` folder, inspect the dirty tree, and avoid unrelated DB/RLS changes already present in the checkout.

### Step 1.0 - Make Queue Row Authoritative

Update `applyRetryableFailure` so it awaits `deps.queue.failJob` and derives retry result from the returned job row. Keep the sanitized failure message and `{ retryable: true }` call unchanged.

### Step 2.0 - Remove Orchestration Retry Dependency

If no remaining orchestration code uses `deps.retry`, remove it from `RegenerationOrchestrationDeps`, `createDefaultRegenerationOrchestrationDeps`, and test dependency builders. Leave `src/shared/retry-policy.ts` imported by queue persistence and policy tests.

### Step 3.0 - Tighten Unit Coverage

Adjust `tests/unit/features/plans/regeneration-orchestration/process.spec.ts`:

- retryable failure with queue returning `status: 'pending'` returns `willRetry: true`;
- retryable failure with queue returning `status: 'failed'` returns `willRetry: false`;
- orchestration no longer calls or injects `decideJobRetry`;
- log fields use returned row values, especially `attempts`, `maxAttempts`, `willRetry`, and `scheduledFor`.

### Step 4.0 - Preserve Queue Retry Coverage

Keep `tests/integration/db/jobs.queue.spec.ts` as the source of truth for `failJobRecord` retry semantics. Add or adjust a focused assertion only if current coverage does not clearly prove `retryable: false`, attempt cap, and `scheduledFor` backoff.

### Step 5.0 - Static Cleanup

Run type/lint checks for the touched surface. Remove unused imports and stale test helpers after deleting `deps.retry`.

### Step 6.0 - Validation

Minimum targeted validation:

- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`
- `pnpm vitest run tests/unit/shared/retry-policy.spec.ts`
- `pnpm vitest run tests/integration/db/jobs.queue.spec.ts`
- `pnpm check:lint`
- `pnpm check:type`

Final baseline required before considering implementation complete:

- `pnpm test:changed`
- `pnpm check:full`

## Risks

- `failJob` can return `null` if the job is no longer editable. Current behavior would still return a precomputed `willRetry`; the planned behavior should treat missing updated row as `willRetry: false` and log enough context to diagnose the mismatch.
- Integration tests require a working Testcontainers runtime. If unavailable, record the exact failure and keep unit/type/lint evidence separate.
- Existing unrelated dirty files must not be staged or edited as part of this issue.

## Non-Goals

- Do not redesign queue retry policy.
- Do not change `retryable === false`, omitted/true retryable semantics, max-attempt handling, or backoff formula.
- Do not migrate unrelated regeneration worker behavior.
- Do not touch current DB/RLS work already dirty in the checkout.

## Open Questions

- Should `failJob` eventually expose a structured mutation result with both row and retry decision? Not needed for this slice, but worth revisiting if more callers need retry reason text rather than only persisted outcome.
