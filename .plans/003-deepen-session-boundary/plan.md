# Plan: Deepen Plan Generation Session Boundary (issue #303)

This file mirrors the active execution plan stored at
`/Users/juansaldana/.cursor/plans/deepen_session_boundary_9be66005.plan.md`.
The canonical version lives in `.cursor/plans/`; this copy exists for the
`.plans/` workflow audit trail per repo `AGENTS.md`.

## Goal

Stop leaking lifecycle DTOs (`ProcessGenerationInput`, `GenerationAttemptResult`)
into HTTP routes and integration tests. Hide DB-lease lifetime, lifecycle
wiring, model resolution, SSE choreography, and cleanup behind a single
boundary. Move the test seam down one level to lifecycle-factory injection.

## Test Seam

`createPlanGenerationSessionBoundary({ createLifecycleService? })`:

- Default: `createPlanLifecycleService({ dbClient, jobQueue: noopJobQueue })`
- Tests: pass a fake `PlanLifecycleService`
- `PlanGenerationHandlerOverrides` retired

## Phases

- **Phase 0** — Create plan/todos artifacts (this file).
- **Phase 1** — Refactor `src/features/plans/session/plan-generation-session.ts`:
  remove `PlanGenerationHandlerOverrides`, export
  `RetryPlanGenerationPlanSnapshot`, add `PlanGenerationSessionBoundary`
  interface and `createPlanGenerationSessionBoundary` factory, collapse public
  functions into private `run(SessionCommand)`.
- **Phase 2** — Routes drop `PlanGenerationHandlerOverrides`, accept
  `{ boundary?, logger? }`, call `boundary.respond*Stream(args)` with
  `responseHeaders` + `tierDb` rename.
- **Phase 3** — New boundary specs at
  `tests/integration/features/plans/session/`.
- **Phase 4** — Slim/rewrite existing route specs to HTTP preflight only.
- **Phase 5** — Targeted vitest + `pnpm test:changed` + `pnpm check:full`.
- **Phase 6** — Verify ACs and close issue #303.

## Files Touched

Refactor:
- `src/features/plans/session/plan-generation-session.ts`
- `src/app/api/v1/plans/stream/route.ts`
- `src/app/api/v1/plans/[planId]/retry/route.ts`

New:
- `tests/integration/features/plans/session/respond-create-stream.spec.ts`
- `tests/integration/features/plans/session/respond-retry-stream.spec.ts`

Slim/rewrite:
- `tests/integration/api/plans-stream.spec.ts`
- `tests/integration/api/plans-retry.spec.ts`
- `tests/integration/api/user-provisioning.spec.ts`
