# 318 — Observability: tune retryable regeneration failure logging (info payload)

## Acceptance Criteria

- [x] `info` log line for retryable regeneration failures is bounded by default and does not include huge serialized payloads.
- [x] Full diagnostic path still exists for local/staging or opt-in, with `LOG_LEVEL=debug` or the chosen mechanism documented.
- [x] Queue retry behavior and HTTP/SSE contracts do not change.
- [x] Tests are updated where retryable-failure log assertions exist.

## Tasks (aligned with plan.md Steps)

### Step 0.0 — Confirm Scope

- [x] Fetch live issue #318 title, body, labels, state, and URL.
- [x] Confirm `.plans/` is the active planning root.
- [x] Check for an existing `.plans/318-*` folder before creating one.
- [x] Inspect current `applyRetryableFailure` logging and adjacent test assertions.
- [x] Note adjacent #316 and #317 plan dependencies that may affect implementation order.

### Step 1.0 — Add Diagnostic Logger Capability

- [x] Widen `RegenerationOrchestrationDeps['logger']` to include `debug`.
- [x] Update default dependency wiring to satisfy the widened logger shape.
- [x] Update regeneration orchestration test logger mocks or shared helper defaults to include `debug`.

### Step 2.0 — Bound the Info Event

- [x] Compute the sanitized failure message once inside `applyRetryableFailure`.
- [x] Remove `error: result.error` from the retryable-failure `info` payload.
- [x] Keep small operational fields in `info`: `jobId`, `planId`, `classification`, sanitized message, retry outcome fields available in the live tree.
- [x] Preserve the existing `deps.queue.failJob(job.id, sanitizedMessage, { retryable: true })` behavior.

### Step 3.0 — Add Full Debug Diagnostic

- [x] Add a separate `deps.logger.debug` call for full `result.error` details.
- [x] Include enough correlation fields in the debug event to tie it back to the bounded `info` event.
- [x] Document the full-detail diagnostic path (`LOG_LEVEL=debug` unless implementation chooses a different explicit toggle).

### Step 4.0 — Tighten Unit Coverage

- [x] Update retryable-failure unit assertions so `info` is bounded and excludes the full error object.
- [x] Add or adjust assertions proving `debug` receives the full error details.
- [x] Keep `failJob` assertion unchanged for sanitized message and `{ retryable: true }`.
- [x] If #317 has landed, update shared helper-backed tests rather than duplicating logger mock changes.

### Step 5.0 — Contract Check

- [x] Confirm no HTTP route behavior changed.
- [x] Confirm no SSE event payload or stream emitter behavior changed.
- [x] Confirm queue retry behavior remains unchanged.

### Step 6.0 — Validation

- [x] Run `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`.
- [x] Run `pnpm check:type`.
- [x] If #316 or #317 changes are present, run adjacent regeneration orchestration and retry-policy tests listed in `plan.md`.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.

## Review

### Deviations / notes

- Implemented #318 after the earlier planning pass.
- The repo convention is `.plans/<issue>-<slug>/plan.md` plus `todos.md`; this package follows that existing convention.
- Existing dirty files outside `.plans/318-observability-tune-retryable-regeneration-failure-logging-info-payload/` were present before this plan and are out of scope.
- #316 and #317 plan folders already exist and may change the exact implementation surface for #318.
- Implementation found #316-style queue-row retry outcome changes already present in the live tree, including removal of `deps.retry`.
- #317-style shared helper changes were also present in the live test files during final review; #318 kept working with that shape rather than reverting it.
- `scheduledFor` is selected from DB rows but not exposed on the public `Job` type, so #318's bounded log uses the retry fields available from `Job`: `queueStatus`, `attemptNumber`, `maxAttempts`, and `willRetry`.
- Full retryable failure error objects now log only through `deps.logger.debug`; bounded `info` keeps correlation and retry outcome fields only.

### Evidence table (Step 6.0)

| Command / check                                                                                                                                             | Status | Notes                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `gh issue view 318 --json title,body,labels,state,url`                                                                                                      | Passed | Confirmed issue title, acceptance criteria, labels, state, and URL.                               |
| `find .plans -maxdepth 2 -type f`                                                                                                                           | Passed | Confirmed existing `.plans/316-*` and `.plans/317-*`; no existing `.plans/318-*` before creation. |
| `rg -n "applyRetryableFailure\|result\\.error\|decideJobRetry\|regeneration" src tests .plans/316-* .plans/317-*`                                           | Passed | Located production log payload, retry policy context, and log assertions.                         |
| `nl -ba src/features/plans/regeneration-orchestration/process.ts`                                                                                           | Passed | Confirmed `info` log includes `error: result.error` in `applyRetryableFailure`.                   |
| `nl -ba tests/unit/features/plans/regeneration-orchestration/process.spec.ts`                                                                               | Passed | Confirmed unit test currently expects the full error object in the `info` log.                    |
| `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`                                                                      | Passed | 15 tests passed after bounded info/debug diagnostic update.                                       |
| `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts` | Passed | 29 tests passed; request logger mock covers widened dep shape.                                    |
| `pnpm check:type`                                                                                                                                           | Passed | Type check clean after removing unsupported `scheduledFor` from public `Job` log fields.          |
| `git diff --check`                                                                                                                                          | Passed | No whitespace errors.                                                                             |
| `pnpm test:changed`                                                                                                                                         | Passed | Changed unit and integration bundles passed.                                                      |
| `pnpm check:full`                                                                                                                                           | Passed | Oxlint found 0 warnings/errors; type check passed.                                                |

### Security Review Checklist (plan.md)

- [x] Confirm bounded `info` log does not serialize provider error bodies, prompts, stack traces, or nested payloads by default.
- [x] Confirm debug diagnostic path is explicitly opt-in outside local defaults.
- [x] Confirm no sanitized HTTP/SSE error contract is loosened.

### Validation excerpts

- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts` — 15 tests passed.
- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts` — 29 tests passed.
- `pnpm check:type` — passed.
- `git diff --check` — passed.
- `pnpm test:changed` — changed unit and integration bundles passed.
- `pnpm check:full` — lint and type passed.

### Follow-ups

- None for #318. Implementation was applied against the live #316-style queue-row retry outcome.
