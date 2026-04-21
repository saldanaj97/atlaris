# 003 — Deepen Plan Generation Session Boundary

Source: GitHub issue [#303](https://github.com/saldanaj97/atlaris/issues/303) — RFC: deepen the plan generation session boundary.

## Acceptance Criteria

- [x] `PlanGenerationSessionBoundary` interface exported from `src/features/plans/session/plan-generation-session.ts`
- [x] `respondCreateStream` / `respondRetryStream` are the only public entry points on the boundary
- [x] Private shared `run(command)` core handles create + retry through one path
- [x] Routes call only `boundary.respond*Stream(args)` plus HTTP-preflight glue
- [x] `PlanGenerationHandlerOverrides` removed (zero references remain)
- [x] Test seam = lifecycle-factory injection at boundary (`createLifecycleService?: (db) => PlanLifecycleService`), not lifecycle DTOs at route
- [x] New boundary specs cover: create success, retry success, handled failure, unhandled failure cleanup, abort/disconnect, response-header passthrough
- [x] Old route specs no longer import `ProcessGenerationInput` / `GenerationAttemptResult`
- [x] `pnpm test:changed` + `pnpm check:full` green

## Phases

- [x] Phase 0 — Setup: create plan + todos files
- [x] Phase 1 — Boundary refactor (`plan-generation-session.ts`)
- [x] Phase 2 — Route updates (`stream/route.ts`, `[planId]/retry/route.ts`)
- [x] Phase 3a — New boundary spec: respond-create-stream (8 tests, green)
- [x] Phase 3b — New boundary spec: respond-retry-stream (8 tests, green)
- [x] Phase 4a — Slim `plans-stream.spec.ts` to HTTP preflight (10 tests, green)
- [x] Phase 4b — Slim `plans-retry.spec.ts` to HTTP preflight (3 tests, green)
- [x] Phase 4c — Refactor `user-provisioning.spec.ts` to default boundary + mock AI env (1 test, green)
- [x] Phase 5 — Validation (`pnpm test:changed` + `pnpm check:full` green)
- [x] Phase 6 — Verify ACs, close issue #303

## Review

### What changed

- `src/features/plans/session/plan-generation-session.ts` now exports
  `PlanGenerationSessionBoundary`, `RespondCreateStreamArgs`,
  `RespondRetryStreamArgs`, `RetryPlanGenerationPlanSnapshot`,
  `CreateLifecycleService`, `CreateSessionBoundaryDeps`, and the
  `createPlanGenerationSessionBoundary({ createLifecycleService? })` factory.
  The two former exports (`createAndStreamPlanGenerationSession`,
  `retryAndStreamPlanGenerationSession`) and `PlanGenerationHandlerOverrides`
  are gone. Internally a private `run(command, buildLifecycle)` shares the
  DB-lease-open + lifecycle-construct + SSE-response path between create and
  retry. All previous helpers (`requirePdfCreateBody`,
  `buildCreatePdfPlanInput`, `buildCreateGenerationInput`,
  `throwCreatePlanResultError`, etc.) are now private.
- Both routes (`src/app/api/v1/plans/stream/route.ts`,
  `src/app/api/v1/plans/[planId]/retry/route.ts`) accept an optional
  `boundary?: PlanGenerationSessionBoundary` dep and default to a module-scope
  singleton built via `createPlanGenerationSessionBoundary()`. The retry route
  passes `tierDb: db` (renamed from `requestDb`) and `responseHeaders` (renamed
  from `headers`).
- New boundary specs at
  `tests/integration/features/plans/session/respond-create-stream.spec.ts`
  (8 tests) and `respond-retry-stream.spec.ts` (8 tests) cover the SSE
  contract, sanitized error emission, fallback error on unhandled failure,
  client-disconnect suppression, response-header passthrough, model-override
  forwarding, and per-request lifecycle factory invocation.
- `tests/integration/api/plans-stream.spec.ts` shrank from ~1310 lines / 18
  tests to ~520 lines / 10 tests covering only HTTP preflight (bad JSON,
  payload-log Sentry path, ZodError, rate-limit headers, default-boundary
  smoke, model query handling, PDF security tests).
- `tests/integration/api/plans-retry.spec.ts` shrank from ~492 lines / 8 tests
  to ~210 lines / 3 tests covering only HTTP preflight (default-boundary smoke,
  durable rate limit, invalid plan state).
- `tests/integration/api/user-provisioning.spec.ts` switched from
  `overrides.processGenerationAttempt` to default boundary + `AI_PROVIDER=mock`
  env stub. No lifecycle DTOs leak.

### Validation

- Targeted vitest: 30/30 green across all new + slimmed integration specs
- Lifecycle / session unit tests: 87/87 green (process-generation,
  lifecycle-consolidation, service, fallback-error-like, helpers-usage)
- `pnpm check:full` green (lint + tsgo)
- `pnpm test:changed` green (unit + integration bundles)

### Notes / follow-ups

- **Done (GitHub #308):** The duplicate `model-resolution.ts` under
  `src/app/api/v1/plans/stream/` was removed; canonical policy lives only in
  `src/features/plans/session/model-resolution.ts`, with tests in
  `tests/unit/features/plans/session/model-resolution.spec.ts`.
- The session module no longer leaks `PlanLifecycleService` shape to test
  authors: the only injected seam is `(db) => PlanLifecycleService`, so future
  refactors of the lifecycle's internal port wiring will not ripple into
  boundary specs.
