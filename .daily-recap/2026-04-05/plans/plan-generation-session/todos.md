# Plan Generation Session — Todos

## Context

This workspace lives under `.plans/`, which is the canonical planning root defined by [`AGENTS.md`](/Users/juansaldana/Dev/Projects/atlaris/AGENTS.md).

## Research Tasks

- [x] Read repo guidance, learnings, and adjacent authenticated-request-scope research.
- [x] Trace the create stream route, retry route, stream helpers, lifecycle service, and adapters.
- [x] Trace the client session flow across create hook, retry hook, and plan-creation panels.
- [x] Inspect relevant tests for route, lifecycle, hook, and panel behavior.
- [x] Capture initial findings, risks, and slice boundaries in [research.md](./research.md).

## Planning Tasks

- [x] Recommend keeping SSE as the transport for this pass, while hiding more of it behind a deeper session boundary.
- [x] Recommend converging interactive create and retry on one session abstraction.
- [x] Recommend keeping "cancel" as a local disconnect/recovery story for this pass.
- [x] Recommend preserving redirect-on-`plan_start` for this pass.
- [x] Recommend fixing long-lived RLS/session lifetime locally here instead of blocking on authenticated-request-scope.
- [x] Recommend keeping queued regeneration out of first-pass scope.
- [x] Draft the implementation plan and acceptance criteria.

## Implementation — Slice 1: Server Session Boundary + Event Contract

- [x] 1.1 Define session event contract in `src/features/plans/session/session-events.ts`
- [ ] 1.2a Write boundary tests for server session (`tests/integration/session/plan-generation-session.spec.ts`)
- [x] 1.2b Extract shared server session module in `src/features/plans/session/server-session.ts`
- [x] 1.2c Fix session creation to use injected stream-scoped DB client for lifecycle work
- [x] 1.2d Collapse create route to a thinner HTTP adapter around shared session helpers
- [x] 1.2e Collapse retry route to a thinner HTTP adapter + fix DB lifetime with `createStreamDbClient()`
- [x] 1.3 Remove legacy `executeGenerationStream` from helpers.ts
- [x] 1.4 Validate implemented slice with scoped lint/test/type-check runs

## Implementation — Slice 2: Client Session Controller

- [ ] 2.1a Write hook tests for `usePlanGenerationSession` (`tests/unit/session/usePlanGenerationSession.spec.tsx`)
- [x] 2.1b Implement `usePlanGenerationSession` shared hook in `src/features/plans/session/`
- [x] 2.1c Remove fake `persisting` state from the shared session flow
- [ ] 2.1d Adapt `ManualCreatePanel` to use shared hook
- [ ] 2.1e Adapt `PdfCreatePanel` to use shared hook (generation phase only)
- [ ] 2.1f Adapt `PlanPendingState` to use shared hook for retry
- [ ] 2.1g Simplify or delete `streamingPlanError.ts`
- [x] 2.1h Reduce `useStreamingPlanGeneration.ts` and `useRetryGeneration.ts` to wrappers over the shared hook
- [x] 2.2 Validate implemented client/session changes with scoped lint/test/type-check runs

## Implementation — Slice 3: Test Consolidation

- [ ] 3.1a Inventory existing test assertions and map to replacement locations
- [ ] 3.1b Write missing boundary tests identified during inventory
- [ ] 3.1c Delete seam tests replaced by boundary tests
- [ ] 3.1d Verify no coverage regression for critical paths
- [x] 3.2 Validate: `pnpm test:changed` clean for the implemented work

## Implementation — Slice 4: Documentation & Dead Code Cleanup

- [x] 4.1 Update `docs/architecture/plan-generation-architecture.md` to reflect session boundary
- [x] 4.2a Re-confirm zero live product-code callers in `src`, then fully remove `POST /api/v1/plans`
- [x] 4.2b Remove related `/api/v1/plans` OpenAPI, docs, contract-test, and broad test/fixture references
- [x] 4.2c Verify legacy helpers and old hooks are reduced/removed where this refactor touched them
- [x] 4.3 Validate: type-check, tests pass, and only intentional historical references remain

## Review

- The lifecycle service is not the problem. The lie is that everything around it is already thin.
- Create and retry are coupled enough to share architecture, but still duplicated enough to drift.
- The likely retry-route connection-lifetime risk is the kind of bug that will slip past current tests because test runtime uses service-role `getDb()`.
- "Cancellation" is currently ambiguous. If we keep the ambiguity, we are designing around wishful thinking instead of product truth.

## Results

- Landed shared session files in `src/features/plans/session/` for stream-scoped DB creation, shared SSE event typing, and a shared client session hook.
- Refactored `POST /api/v1/plans/stream` and `POST /api/v1/plans/[planId]/retry` to delegate their streaming lifecycle work through the shared session helpers.
- Removed the dead `executeGenerationStream` path and deleted the legacy `POST /api/v1/plans` endpoint plus its OpenAPI/docs/contract references.
- Reduced `useStreamingPlanGeneration.ts` and `useRetryGeneration.ts` to wrappers over `usePlanGenerationSession` so existing consumers can stay stable for this pass.
- Validation completed successfully during this workstream: `pnpm lint:changed`, `pnpm test:changed`, and `pnpm type-check` passed.

## Deferred

- Dedicated server-session integration tests and shared client-hook tests were not added in this pass.
- UI panels and `streamingPlanError.ts` were left on the existing wrapper-hook surface for now, which kept the refactor smaller and avoided mixing more UI churn into this commit.
