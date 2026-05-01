# Tests: shared RegenerationOrchestrationDeps factory

## Issue

GitHub issue: https://github.com/saldanaj97/atlaris/issues/317

`tests/unit/features/plans/regeneration-orchestration/request.spec.ts` and `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` both hand-build large `RegenerationOrchestrationDeps` fixtures. The duplicated builders have the same dependency surface but different defaults, so future additions to `RegenerationOrchestrationDeps` can drift between specs.

Acceptance criteria from the issue:

- Shared helper used by both request and process regeneration orchestration unit specs, or documented split if coupling is worse.
- No behavior change in existing assertions; same mocks/spies patterns, less duplicated boilerplate.
- `pnpm exec tsx scripts/tests/run.ts unit` on the two spec files passes.

## Current State

Primary code anchors:

- `src/features/plans/regeneration-orchestration/deps.ts` defines `RegenerationOrchestrationDeps`.
- `src/features/plans/regeneration-orchestration/request.ts` consumes request-side deps for queue enablement, ownership lookup, active-job dedupe, rate limiting, quota reserve, enqueue, and inline drain scheduling.
- `src/features/plans/regeneration-orchestration/process.ts` consumes process-side deps for dequeue, payload validation, plan lookup, lifecycle execution, queue completion/failure, retry outcome logging, and default service-role execution.
- `tests/unit/features/plans/regeneration-orchestration/request.spec.ts` defines `buildDeps`, `ownedPlan`, `fakeDb`, `baseToken`, and `deferred`.
- `tests/unit/features/plans/regeneration-orchestration/process.spec.ts` defines `buildProcessDeps`, `planRow`, `makeLifecycleServiceMock`, and `makeJob`.

The duplicated dependency builders are similar enough to share the outer factory and override merge logic. The fixtures should not be forced into one identical default row shape because request tests use a minimal owned-plan DTO while process tests use a richer persisted plan row. Hiding that difference would make the tests less honest.

## Proposed Approach

Create a small test helper under `tests/helpers/` that owns the reusable regeneration orchestration dependency fixture surface while keeping request/process-specific domain fixtures visible.

Recommended helper location:

- `tests/helpers/regeneration-orchestration-deps.ts`

The helper should export:

- a reusable `RegenerationOrchestrationDepsOverrides` mapped type with partial nested overrides;
- `makeRegenerationOrchestrationDeps(overrides?)` for the common dependency object and override merge logic;
- `makeLifecycleServiceMock(processGenerationAttempt?)` because process tests need a typed lifecycle service stub;
- optionally `makePlanRegenerationJob(overrides?)` only if moving `makeJob` does not obscure the process test's plan-row relationship.

Keep these local to the helper only if they remain generic:

- default queue methods;
- default quota `runReserved`;
- default tier/priority/inlineDrain/rateLimit/logger mocks;
- default `dbClient` shape that can be overridden per spec.

Keep these in specs if moving them worsens readability:

- request-specific `ownedPlan`;
- request-specific `baseToken`;
- process-specific `planRow`;
- process-specific job data cases.

## Implementation Steps

### Step 0.0 - Confirm Scope

Re-read issue #317, confirm `.plans/` is the active planning root, inspect dirty tree, and avoid unrelated request-boundary/API changes already present in the checkout.

### Step 1.0 - Extract Shared Test Helper

Add `tests/helpers/regeneration-orchestration-deps.ts` with a default `RegenerationOrchestrationDeps` builder and the shared override type. Use existing repo test aliases for imports.

The helper should preserve the existing override behavior:

- top-level `dbClient` override replaces the default client;
- nested dependency groups merge shallowly (`queue`, `quota`, `plans`, `tier`, `priority`, `lifecycle`, `inlineDrain`, `rateLimit`, `logger`);
- queue overrides are partial, matching both current specs.

### Step 2.0 - Migrate Request Spec

Replace the local `RequestDepsOverrides` and `buildDeps` in `request.spec.ts` with the shared helper. Keep `fakeDb`, `ownedPlan`, `baseToken`, and `deferred` in the spec unless the helper can take them without coupling request and process fixtures.

Pass request-specific defaults through helper overrides where needed:

- `dbClient: fakeDb`;
- `plans.findOwnedPlan` returning `ownedPlan`;
- `quota.runReserved` preserving the current reserve/compensate behavior used by quota tests;
- `inlineDrain.tryRegister` preserving the current default that invokes the drain promise.

### Step 3.0 - Migrate Process Spec

Replace `ProcessDepsOverrides`, `buildProcessDeps`, and `makeLifecycleServiceMock` with the shared helper exports. Keep `planRow` and job-specific fixture data in the process spec unless extracting `makePlanRegenerationJob` keeps the relationship to `planRow` explicit.

Pass process-specific defaults through helper overrides:

- `dbClient.query.learningPlans.findFirst` returning `planRow`;
- `lifecycle.service` from `makeLifecycleServiceMock()`;
- queue completion/failure defaults matching current assertions;
- existing queue failure defaults matching current retryable outcome assertions.

### Step 4.0 - Preserve Assertion Semantics

Run the two specs and compare failures carefully. Do not "simplify" tests by weakening assertions. Any changed mock call shape must be caused by helper migration only and should be fixed by preserving the original defaults.

### Step 5.0 - Static Cleanup

Remove stale imports, duplicate mapped types, and local helper definitions from both specs. Keep helper exports narrow so this does not become a generic test utility dumping ground.

### Step 6.0 - Validation

Minimum targeted validation required by issue:

- `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts`

Additional local checks recommended for implementation:

- `pnpm vitest run tests/unit/features/plans/regeneration-orchestration/request.spec.ts tests/unit/features/plans/regeneration-orchestration/process.spec.ts`
- `pnpm check:type`

Final baseline required before considering implementation complete:

- `pnpm test:changed`
- `pnpm check:full`

## Risks

- Over-sharing fixtures can hide real differences between request-side owned-plan DTOs and process-side persisted plan rows. Keep domain rows near the tests unless a helper stays obviously semantic.
- A helper with too many optional knobs becomes worse than duplication. Keep one builder, one override type, lifecycle service helper, and possibly one job helper.
- Existing dirty API/request-boundary files are unrelated. Do not stage or edit them for this issue.

## Non-Goals

- Do not change `RegenerationOrchestrationDeps` production shape.
- Do not change queue, quota, rate-limit, lifecycle, retry, or inline-drain behavior.
- Do not rewrite regeneration orchestration tests beyond dependency setup cleanup.
- Do not expand the task into broader test fixture architecture.

## Open Questions

- Should `makePlanRegenerationJob` move to the shared helper? Decide during implementation after checking whether the process spec remains clearer with `planRow` and job creation side by side.
