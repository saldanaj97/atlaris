# 317 — Tests: shared RegenerationOrchestrationDeps factory (request + process specs)

## Acceptance Criteria

- [x] Shared helper used by both request and process regeneration orchestration unit specs, or documented split if coupling is worse.
- [x] No behavior change in existing assertions; same mocks/spies patterns, less duplicated boilerplate.
- [x] `pnpm exec tsx scripts/tests/run.ts unit` on the two spec files passes.

## Tasks (aligned with plans.md Steps)

### Step 0.0 — Confirm Scope

- [x] Load live GitHub issue #317 and extract acceptance criteria.
- [x] Confirm `.plans/` is the active planning root.
- [x] Confirm no existing `.plans/317-*` folder is present.
- [x] Inspect current dirty tree and mark unrelated files out of scope.
- [x] Inspect request/process regeneration orchestration specs and production dep shape.

### Step 1.0 — Extract Shared Test Helper

- [x] Add a focused helper under `tests/helpers/` for regeneration orchestration dependency fixtures.
- [x] Export a shared override type that supports shallow nested dependency overrides.
- [x] Export a default dependency builder that preserves current queue/quota/plans/tier/priority/lifecycle/inlineDrain/rateLimit/logger defaults.
- [x] Export `makeLifecycleServiceMock` if process tests still need a typed lifecycle stub.

### Step 2.0 — Migrate Request Spec

- [x] Replace local `RequestDepsOverrides` and `buildDeps` with the shared helper.
- [x] Keep request-specific `ownedPlan`, `baseToken`, `fakeDb`, and `deferred` local unless moving them stays clearer.
- [x] Preserve request-specific quota reserve/compensate behavior.
- [x] Preserve inline drain default behavior and rejection logging assertions.

### Step 3.0 — Migrate Process Spec

- [x] Replace local `ProcessDepsOverrides`, `buildProcessDeps`, and duplicate lifecycle helper with shared helper exports.
- [x] Keep `planRow` local unless extracting a job helper keeps test intent clearer.
- [x] Preserve process-specific DB lookup, lifecycle, and queue defaults.
- [x] Preserve every current assertion and mock/spies pattern.

### Step 4.0 — Preserve Assertion Semantics

- [x] Run the two affected specs after migration.
- [x] Fix helper defaults if any mock call shape or result changes.
- [x] Do not weaken assertions to make the refactor pass.

### Step 5.0 — Static Cleanup

- [x] Remove stale imports and duplicate local helper types/functions from both specs.
- [x] Keep helper exports narrow and regeneration-specific.
- [x] Check for formatting/type fallout in touched files.

### Step 6.0 — Validation

- [x] Run `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts`.
- [x] Run `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts`.
- [x] Run `pnpm check:type`.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.

## Review

### Deviations / notes

- Implemented in `tests/helpers/regeneration-orchestration-deps.ts`, `request.spec.ts`, and `process.spec.ts`.
- Existing dirty files and other plan folders outside `.plans/317-tests-shared-regenerationorchestrationdeps-factory/` were present or created by other workstreams and are out of scope.
- The local Atlaris convention uses `plan.md`; this package follows that convention even though the global skill text still mentions `plans.md`.
- `plan.md` recommends keeping request/process domain rows near their specs unless extraction clearly improves readability. This avoids fake "DRY" that hides meaningful fixture differences.

### Evidence table (Step 6.0)

| Command                                                                                                                                                                             | Status | Notes                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `gh issue view 317 --json title,body,labels,state,url`                                                                                                                              | Passed | Confirmed live issue title, body, labels, state, and acceptance criteria.                  |
| `find .plans -maxdepth 2 -type f \| sort`                                                                                                                                           | Passed | Existing plan packages were #001 and #316 only; no #317 package existed.                   |
| `sed -n` over `request.spec.ts`, `process.spec.ts`, and `deps.ts`                                                                                                                   | Passed | Verified duplicated dependency builders and current `RegenerationOrchestrationDeps` shape. |
| `rg -n "RegenerationOrchestrationDeps\|buildDeps\|buildProcessDeps\|makeLifecycleServiceMock\|makeJob\\(" tests src/features/plans/regeneration-orchestration`                      | Passed | Located the affected helper duplication and confirmed the primary local consumers.         |
| `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts` | Passed | 2 files, 29 tests passed.                                                                  |
| `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts`                         | Passed | 2 files, 29 tests passed.                                                                  |
| `pnpm check:type`                                                                                                                                                                   | Passed | `tsgo --noEmit --checkers 4` passed.                                                       |
| `pnpm test:changed`                                                                                                                                                                 | Passed | Unit changed: 2 files, 29 tests passed. Integration changed: no matching files, exited 0.  |
| `pnpm check:full`                                                                                                                                                                   | Passed | Oxlint found 0 warnings/errors; type check passed.                                         |

### Security Review Checklist (plans.md)

- [x] No production auth, DB, RLS, or service-role behavior changes.
- [x] No new service-role imports in tests beyond existing mocked dependency shape.
- [x] No weakening of ownership, quota, rate-limit, retry, or queue assertions.
- [x] No logging changes.

### Validation excerpts

- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts` — passed, 2 files / 29 tests.
- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts` — passed, 2 files / 29 tests.
- `pnpm check:type` — passed.
- `pnpm test:changed` — passed.
- `pnpm check:full` — passed.

### Follow-ups

- None for planning. Implementation should stay inside test helper/spec cleanup unless the dep interface changes while the work is in progress.
