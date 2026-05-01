# 316 — Queue: avoid duplicate decideJobRetry (orchestration vs failJobRecord)

## Acceptance Criteria

- [x] `decideJobRetry` is not evaluated twice for the same failure path unless explicitly documented and tested.
- [x] `willRetry` and log fields stay consistent with the row written to `job_queue` using the same attempt number and cap semantics.
- [x] Targeted unit tests for regeneration orchestration plus integration or unit coverage for the `failJobRecord` retry path still pass.
- [x] No regression on `scheduledFor` backoff.

## Tasks (aligned with plans.md Steps)

### Step 0.0 — Confirm Scope

- [x] Load live GitHub issue #316 and extract acceptance criteria.
- [x] Confirm `.plans/` is the active planning root.
- [x] Confirm no existing `.plans/316-*` folder is present.
- [x] Inspect current dirty tree and mark unrelated files out of scope.

### Step 1.0 — Make Queue Row Authoritative

- [x] Update `applyRetryableFailure` to call `deps.queue.failJob` before deriving `willRetry`.
- [x] Derive `willRetry` from the returned job row status.
- [x] Keep the sanitized failure message and `{ retryable: true }` queue call semantics unchanged.
- [x] Log retry outcome fields from the returned row rather than a separate retry-policy decision.

### Step 2.0 — Remove Orchestration Retry Dependency

- [x] Remove `retry` from `RegenerationOrchestrationDeps` if no remaining orchestration path uses it.
- [x] Remove the default `decideJobRetry` import/wiring from `deps.ts`.
- [x] Remove stale retry mocks from process tests.
- [x] Keep `decideJobRetry` owned by queue persistence and pure policy tests.

### Step 3.0 — Tighten Unit Coverage

- [x] Cover returned pending queue row mapping to `willRetry: true`.
- [x] Cover returned failed queue row mapping to `willRetry: false`.
- [x] Assert orchestration does not make its own retry-policy call.
- [x] Assert retry log fields reflect returned row values.

### Step 4.0 — Preserve Queue Retry Coverage

- [x] Re-check `tests/integration/db/jobs.queue.spec.ts` for retryable, non-retryable, cap, and backoff coverage.
- [x] Add only focused queue assertions if current coverage does not prove the acceptance criteria.

### Step 5.0 — Static Cleanup

- [x] Remove unused imports/types after retry dependency deletion.
- [x] Run lint/type checks for touched code and fix scoped fallout.

### Step 6.0 — Validation

- [x] Run `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`.
- [x] Run `pnpm vitest run tests/unit/shared/retry-policy.spec.ts`.
- [x] Run `pnpm vitest run tests/integration/db/jobs.queue.spec.ts`.
- [x] Run `pnpm check:lint`.
- [x] Run `pnpm check:type`.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.

## Review

### Deviations / notes

- Implemented after planning approval.
- Existing dirty files outside the #316 implementation files were present before/during this work and were left untouched.
- The local Atlaris convention uses `plan.md`; this package follows that convention even though the global skill text still mentions `plans.md`.
- `pnpm test:changed` was run and failed in unrelated `tests/integration/stripe/usage.spec.ts` cases from the broader dirty workspace. Targeted #316 unit/integration coverage passed.

### Evidence table (Step 6.0)

| Command                                                                                                                                                                                                                                                                                                                        | Status           | Notes                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `gh issue view 316 --json title,body,labels,state,url,number`                                                                                                                                                                                                                                                                  | Passed           | Confirmed live issue title, body, labels, state, and acceptance criteria.                                                               |
| `find .plans -maxdepth 1 -type d -name '316-*' -print`                                                                                                                                                                                                                                                                         | Passed           | No existing issue #316 plan folder found.                                                                                               |
| `rg -n "decideJobRetry\|failJobRecord\|failJob\(\|applyRetryableFailure\|getJobRetryDelayMs\|willRetry\|scheduledFor" src tests`                                                                                                                                                                                               | Passed           | Located orchestration, queue persistence, retry policy, and tests.                                                                      |
| `rg -n "deps\\.retry\|retry: \\{\|decideJobRetry" src/features/plans/regeneration-orchestration tests/unit/features/plans/regeneration-orchestration`                                                                                                                                                                          | Passed           | No orchestration retry dependency remains; command exits 1 because there are no matches.                                                |
| `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`                                                                                                                                                                                                                                         | Passed           | 15 tests passed.                                                                                                                        |
| `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts`                                                                                                                                                                                                                                         | Passed           | 14 tests passed.                                                                                                                        |
| `pnpm vitest run tests/unit/shared/retry-policy.spec.ts`                                                                                                                                                                                                                                                                       | Passed           | 14 tests passed.                                                                                                                        |
| `pnpm vitest run tests/integration/db/jobs.queue.spec.ts`                                                                                                                                                                                                                                                                      | Passed           | 10 tests passed; Testcontainers started and stopped cleanly.                                                                            |
| `pnpm check:lint`                                                                                                                                                                                                                                                                                                              | Passed           | 0 warnings, 0 errors.                                                                                                                   |
| `pnpm check:type`                                                                                                                                                                                                                                                                                                              | Passed           | `tsgo --noEmit --checkers 4` passed.                                                                                                    |
| `pnpm check:full`                                                                                                                                                                                                                                                                                                              | Passed           | lint and type legs passed.                                                                                                              |
| `git diff --check -- src/features/plans/regeneration-orchestration/deps.ts src/features/plans/regeneration-orchestration/process.ts tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts .plans/316-queue-avoid-duplicate-decidejobretry` | Passed           | No whitespace errors in touched #316 files.                                                                                             |
| `pnpm test:changed`                                                                                                                                                                                                                                                                                                            | Failed unrelated | Unit changed passed; integration changed failed 5 `tests/integration/stripe/usage.spec.ts` usage-counter assertions outside #316 scope. |

### Security Review Checklist (plans.md)

- [x] No change to auth or user ownership checks.
- [x] No new service-role import outside existing queue boundary.
- [x] No weakening of job queue RLS or privilege assumptions.
- [x] No logging of raw plan payloads or user-provided notes.

### Validation excerpts

- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/process.spec.ts`: 1 file passed, 15 tests passed.
- `pnpm vitest run tests/unit/shared/retry-policy.spec.ts`: 1 file passed, 14 tests passed.
- `pnpm vitest run tests/integration/db/jobs.queue.spec.ts`: 1 file passed, 10 tests passed.
- `pnpm check:lint`: 0 warnings, 0 errors.
- `pnpm check:type`: passed.
- `pnpm check:full`: passed.
- `pnpm test:changed`: failed in `tests/integration/stripe/usage.spec.ts`; failures expected usage counters/timestamps that the broader dirty workspace did not produce.

### Follow-ups

- Consider a future structured queue mutation result only if additional callers need retry reason text. Do not expand issue #316 for that.
