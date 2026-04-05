# Authenticated Request Scope Deepening

## Objective

Turn the current auth/request-context/RLS access pattern into a boundary that is hard to misuse, easier to test, and does not require callers to memorize wrapper-selection rules.

## Todo

- [x] Establish current-state research scope for authenticated request handling, server actions, server components, and `getDb()` usage.
- [x] Confirm the planning-path mismatch and cleanup target: `.plans/` is canonical, while stale `prds/` artifacts and references still needed explicit cleanup.
- [x] Produce one verified lifecycle-and-surface audit for authenticated request scope.
  - AC: Document the lifecycle end-to-end — **Done** in [analysis.md §1](./analysis.md).
  - AC: Classify every relevant export — **Done** in [analysis.md §2](./analysis.md).
  - AC: Record the verified caller counts — **Done** in [analysis.md §2](./analysis.md).
  - AC: Explicitly record that `getCurrentUserRecordSafe()` has 0 external callers — **Done**.
- [x] Produce a concrete ambiguity-and-contradiction list.
  - AC: Each ambiguity point includes file references — **Done** in [analysis.md §3](./analysis.md) (4 ambiguities, 3 contradictions).
  - AC: Cover wrapper choice, `authUserId` vs `user.id`, etc. — **Done**.
  - AC: Call out contradictions between code, docs, durable learnings, and tests — **Done**.
- [x] Decide what to do with exported dead code and valid escape hatches.
  - **Decision:** Remove `getCurrentUserRecordSafe` (0 callers, caused regression). Keep `getEffectiveAuthUserId` (valid redirect-only escape hatch). Extract `withErrorBoundary`/`withRateLimit` (orthogonal).
  - AC: Test files to adjust: `tests/unit/app/pricing/page.spec.tsx`, `tests/unit/api/auth.spec.ts`.
  - Recorded in [analysis.md §3](./analysis.md).
- [x] Decide the future `getDb()` contract and test-runtime story.
  - **Decision:** Keep ambient `getDb()` fail-closed. Converge isTest branches toward one unified test context using `serviceDb` in a real `RequestContext`.
  - AC: Blast radius of 56 call sites documented (A: 16, B: 37, C: 3).
  - AC: `getDb()` contract unchanged. isTest branches in `withAuth` and `withServerComponentContext` converge.
  - Recorded in [analysis.md §4](./analysis.md).
- [x] Resolve the architectural decision tree with explicit evaluation criteria.
  - **Decisions:** Keep 3 wrappers + shared core. Keep callbacks. Keep ambient `getDb()`. Unified test context. Remove dead code. Extract orthogonal helpers.
  - AC: Each branch has security, misuse-resistance, migration-cost, and testability tradeoffs.
  - Recorded in [analysis.md §5](./analysis.md).
- [x] Resolve any remaining product or engineering tradeoffs with the user.
  - **Resolved:** User chose targeted cleanup (not full redesign) and unified test context (not real RLS in tests).
- [x] Convert the resolved direction into an implementation-ready plan.
  - **Done:** [implementation-plan.md](./implementation-plan.md) — 5 slices with per-step file lists, validation commands, risk mitigations.
  - AC: Migration order, touched-file categories, expected test updates, docs updates, and validation commands — all present.
  - AC: Plan follows Step X.0 / Steps X.1-X.N / Validation / Closure format.

## Review Notes

- 2026-04-05 audit corrections narrowed the active caller-facing surface, added the missing `withErrorBoundary()` and `getDb()` migration concerns, and removed stale guidance that treated `getCurrentUserRecordSafe()` as a live server-component choice.
- 2026-04-05 full analysis completed in [analysis.md](./analysis.md): lifecycle matrix, ambiguity/contradiction list, surface decisions, `getDb()` contract, and resolved decision tree.
- 2026-04-05 implementation-ready plan produced in [implementation-plan.md](./implementation-plan.md): 5 slices covering dead-code removal, helper extraction, isTest convergence, docs, and planning closure. ~25 files affected, low-medium risk.
- 2026-04-05 implementation executed: `getCurrentUserRecordSafe()` removed, `withErrorBoundary()` moved to `src/lib/api/middleware.ts`, test-mode auth wrappers now share a request-context path, and `docs/technical-debt.md` was updated to reflect the cleanup.

## Artifacts

- [research.md](./research.md) — Corrected problem surface and thesis
- [analysis.md](./analysis.md) — Steps 1.1-1.5: lifecycle, surface, ambiguities, decisions
- [implementation-plan.md](./implementation-plan.md) — Step 1.6: execution-ready 5-slice plan
- [plan.md](./plan.md) — Original planning-phase plan (superseded by implementation-plan.md)
