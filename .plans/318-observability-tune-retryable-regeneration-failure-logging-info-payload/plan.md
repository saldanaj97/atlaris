# Observability: tune retryable regeneration failure logging

## Issue

GitHub issue: https://github.com/saldanaj97/atlaris/issues/318

`applyRetryableFailure` logs retryable regeneration failures at `info` with the full `result.error` object. During flaky provider periods, that can make steady-state worker logs noisy and expensive to serialize. The goal is to keep the `info` event operationally useful while moving full diagnostic detail to an explicit lower-volume path.

Acceptance criteria from the issue:

- `info` log line for retryable regeneration failures is bounded by default and does not include huge serialized payloads.
- Full diagnostic path still exists for local/staging or opt-in, with the selected log level or environment toggle documented.
- Queue retry behavior and HTTP/SSE contracts do not change; tests are updated if log assertions exist.

## Current State

Primary code anchors:

- `src/features/plans/regeneration-orchestration/process.ts:186` defines `applyRetryableFailure`.
- `src/features/plans/regeneration-orchestration/process.ts:191` currently derives a retry decision via `deps.retry.decideJobRetry`.
- `src/features/plans/regeneration-orchestration/process.ts:197` logs the retryable failure at `info`.
- `src/features/plans/regeneration-orchestration/process.ts:202` includes `error: result.error` in the `info` log payload.
- `src/features/plans/regeneration-orchestration/process.ts:207` calls `deps.queue.failJob` with a sanitized message and `{ retryable: true }`.
- `src/features/plans/regeneration-orchestration/deps.ts:77` types `logger` as `info`, `error`, and `warn` only, so a debug diagnostic path needs either that type widened or another explicit opt-in path.
- `src/lib/logging/logger.ts:6` defaults local/non-production logging to `debug` and production logging to `info` unless `LOG_LEVEL` overrides it.
- `tests/unit/features/plans/regeneration-orchestration/process.spec.ts:371` asserts the retryable failure log shape.
- `tests/unit/features/plans/regeneration-orchestration/process.spec.ts:414` currently expects `error: expect.any(Error)` in the `info` payload.

Adjacent plan context:

- `.plans/316-queue-avoid-duplicate-decidejobretry/plan.md` intends to make the persisted queue row the authoritative retry outcome and may remove `deps.retry` from orchestration.
- `.plans/317-tests-shared-regenerationorchestrationdeps-factory/plan.md` may move the regeneration orchestration test dependency builder into `tests/helpers/regeneration-orchestration-deps.ts`.

This issue should be implemented after reconciling the live tree against those adjacent changes. Do not assume #316 or #317 has landed just because their plan folders exist.

## Proposed Approach

Split retryable-failure observability into two events:

1. Keep a bounded `info` log for normal operations. Include only stable, small fields:
   - `jobId`
   - `planId`
   - `classification`
   - sanitized failure `message`
   - retry outcome fields available in the live tree, such as `willRetry`, `retryDecision`, `attemptNumber`, `maxAttempts`, and `scheduledFor`
2. Add a full diagnostic log at `debug`, gated naturally by the logger level. Include the full `result.error` object only there.
3. Document that full error detail is available when `LOG_LEVEL=debug` is enabled. Local development already defaults to debug; production/staging can opt in by setting the log level.
4. Keep queue mutation behavior unchanged. The same sanitized message should still be passed to `failJob`.
5. Keep HTTP/SSE behavior unchanged. This code path is worker orchestration; `src/features/plans/session/stream-emitters.ts` has separate SSE logging and is out of scope unless tests prove a direct contract coupling.

Preferred implementation details:

- Add `debug` to `RegenerationOrchestrationDeps['logger']`.
- In default deps, the existing pino logger already has `debug`.
- In tests, add `debug: vi.fn()` to the regeneration orchestration logger mocks or shared helper if #317 lands first.
- Compute the sanitized message once, reuse it for the `info` field and `failJob`.
- Name the full diagnostic event plainly, for example `Regeneration job retryable failure diagnostic`.

## Alternatives Rejected

- Keep the full error at `info` and rely on log backend filtering: this preserves the expensive serialization path and fails the primary issue.
- Drop full error logging entirely: this makes local/staging provider debugging worse and fails the diagnostic-path acceptance criterion.
- Add sampling first: sampling can be useful later, but it adds configuration and test matrix weight for a narrow issue that can be solved with `debug` level.
- Redact by recursively trimming arbitrary error objects at `info`: more code, more edge cases, and still risks serializing large nested provider payloads before trimming.

## Implementation Steps

### Step 0.0 - Confirm Scope

Re-read issue #318, inspect the current state of #316/#317 changes, and confirm whether `applyRetryableFailure` still owns retry-decision logging. Preserve unrelated dirty API/docs work already present in the checkout.

### Step 1.0 - Add Diagnostic Logger Capability

Widen `RegenerationOrchestrationDeps['logger']` to include `debug`. Update default deps and any local test builders or shared helper defaults to provide `debug`.

### Step 2.0 - Bound the Info Event

Update `applyRetryableFailure` so the `info` payload excludes `result.error`. Include small operational fields only. Reuse the sanitized failure message that is sent to `failJob`.

If #316 has landed, derive `willRetry`, `attemptNumber`, `maxAttempts`, and `scheduledFor` from the queue mutation result. If #316 has not landed, keep the existing retry behavior but keep the `info` payload bounded.

### Step 3.0 - Add Full Debug Diagnostic

Add a separate `deps.logger.debug` call containing the full `result.error` object plus the same small identifiers needed to correlate it with the bounded `info` event.

Document `LOG_LEVEL=debug` as the opt-in path for full diagnostic details. A short note in the nearest relevant plan review section may be enough; if the repo has an operations logging doc by implementation time, update that instead.

### Step 4.0 - Tighten Unit Coverage

Update `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` or the shared helper-backed equivalent:

- assert the retryable-failure `info` log does not include `error`;
- assert the bounded fields stay present;
- assert `debug` receives the full error;
- assert `failJob` call shape remains unchanged.

### Step 5.0 - Contract Check

Verify no HTTP/SSE payload contract changed. This should be a code review check unless the implementation unexpectedly touches session emitters or route handlers.

### Step 6.0 - Validation

Minimum targeted validation:

- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`
- `pnpm check:type`

Recommended adjacent validation if #316 or #317 changes are also present in the working tree:

- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts`
- `pnpm vitest run tests/unit/shared/retry-policy.spec.ts`

Final baseline required before considering implementation complete:

- `pnpm test:changed`
- `pnpm check:full`

## Risks

- #316 may reshape retry logging by removing `deps.retry`; implement #318 against the live version rather than duplicating a stale plan.
- #317 may move test builders, so logger mock updates may belong in `tests/helpers/regeneration-orchestration-deps.ts` instead of both specs.
- Adding `debug` to the logger dep is small but cross-cutting for test builders. Miss one mock and type-check will fail.
- If production log level is raised to `debug`, full error detail will be emitted by design. That is the explicit opt-in diagnostic path, not the default.

## Non-Goals

- Do not change retry policy, attempt caps, backoff, queue status transitions, or `failJob` semantics.
- Do not change HTTP responses, SSE events, or plan lifecycle result contracts.
- Do not redesign the app logger or Sentry integration.
- Do not broaden this into provider-error normalization across the AI stack.
- Do not edit unrelated API/request-boundary files currently dirty in the checkout.

## Open Questions

- Should staging always run with `LOG_LEVEL=debug`, or should full diagnostics remain a short-lived opt-in during investigations? The implementation can document the mechanism without deciding deployment policy.
