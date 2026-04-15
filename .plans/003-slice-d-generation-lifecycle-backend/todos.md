# Slice D — Generation lifecycle consolidation (backend) execution todos

## Scope guardrails

- Use `.plans/prelim-refactor-findings/slice-d-plan.md` as the implementation source of truth.
- Do not edit the parent Slice D reference plan during execution.
- Keep SSE event names and ordering stable.
- Keep retry route model-override behavior unchanged.
- Preserve `processGenerationAttempt()` and `runGenerationAttempt()` public behavior.

## Execution gate

- [x] Confirm Docker is running for integration/security test entrypoints.
- [x] Confirm Slice C execution gate is satisfied from `.plans/prelim-refactor-findings/todos.md`.
- [x] Confirm the only pre-existing worktree change is the expected `slice-d-plan.md` modification.

## Commit-ordered work items

- [x] Commit 1 — lock lifecycle parity tests
  - [x] Strengthen route parity coverage for create/retry/regenerate flows.
  - [x] Strengthen queue and attempts persistence regression coverage.
  - [x] Strengthen helper/orchestrator/lifecycle/import-boundary unit coverage.
- [x] Commit 2 — shared session authority + helper split
  - [x] Introduce a feature-owned create/retry generation session entrypoint.
  - [x] Split stream emitters vs cleanup/runtime helpers under `src/features/plans/session/`.
  - [x] Move cancellation and usage helpers to explicit feature-owned homes.
- [x] Commit 3 — route thinning + compatibility cleanup
  - [x] Reduce stream and retry routes to HTTP-only adapters.
  - [x] Remove direct stream DB lifetime and cleanup wiring from route files.
  - [x] Reduce `src/app/api/v1/plans/stream/helpers.ts` to a shim or delete it.
- [x] Commit 4 — lifecycle/orchestrator narrowing
  - [x] Extract lifecycle origin strategies for AI vs PDF creation.
  - [x] Narrow AI orchestrator helpers by decision boundary without changing semantics.
- [x] Commit 5 — queue/persistence split + final cleanup
  - [x] Split jobs monitoring vs mutation responsibilities.
  - [x] Split attempts normalization vs success persistence responsibilities.
  - [x] Delete transitional legacy helpers once proven unused.
- [x] Validation
  - [x] Run targeted Slice D tests.
  - [x] Run `pnpm check:type` and `pnpm check:lint`.
  - [x] Run `pnpm test:changed` and `pnpm check:full`.

## Review

- Added queue regression assertions for terminal idempotency, retry error history,
  monitoring read purity, and cleanup threshold boundaries.
- Added attempt persistence coverage for in-progress reservation rejection, atomic
  module/task replacement via RLS clients, and RLS transaction-context reapply
  ordering in the unit helper.
- Consolidated generation session ownership under `src/features/plans/session/`,
  moved model resolution into the feature layer, and reduced stream/retry routes
  to auth/validation/rate-limit adapters.
- Split lifecycle creation flow into shared pipeline + origin strategies, split AI
  orchestrator helpers by decision boundary, and split jobs/attempt persistence
  helpers by monitoring vs mutation / normalization vs success transaction.
- Validation:
  - ✅ `pnpm exec tsx scripts/tests/run.ts integration tests/integration/api/plans-stream.spec.ts tests/integration/api/plans-retry.spec.ts tests/integration/api/plans.regenerate.spec.ts tests/integration/db/jobs.queries.spec.ts tests/integration/db/jobs.queue.spec.ts tests/integration/db/attempts-atomic-observability.spec.ts`
  - ✅ `pnpm exec tsx scripts/tests/run.ts unit tests/unit/ai/streaming/helpers.spec.ts tests/unit/app/api/v1/plans/stream/helpers-usage.spec.ts tests/unit/db/attempts-persistence.spec.ts`
  - ✅ `pnpm exec tsx scripts/tests/run.ts unit tests/unit/architecture/import-boundaries.spec.ts`
  - ✅ `pnpm check:type`
  - ✅ `pnpm check:lint`
  - ✅ `pnpm test:changed`
  - ✅ `pnpm check:full`
