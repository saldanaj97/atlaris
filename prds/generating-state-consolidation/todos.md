# Generating State Consolidation — Todos

Resolves technical debt item: "Remaining `generationStatus = 'generating'` write in attempt reservation"

## Tasks

- [x] Create `src/lib/db/queries/helpers/plan-generation-status.ts` with `setLearningPlanGenerating()` and `PLAN_GENERATING_INSERT_DEFAULTS`
- [x] Wire `attempts.ts` — replace inline UPDATE with shared helper
- [x] Wire `plan-operations.ts` — replace hardcoded INSERT defaults with shared const
- [x] Add unit test `tests/unit/db/plan-generation-status.spec.ts` (4 tests)
- [x] Run `pnpm test:changed` — 40 tests pass across 8 files
- [x] Typecheck clean (`tsc --noEmit`)
- [x] Lint clean (`biome check`)
- [x] Update `docs/technical-debt.md` — mark section as resolved

## Review

**Files changed (3 modified, 2 new):**
- `src/lib/db/queries/helpers/plan-generation-status.ts` — NEW: shared helper + typed const
- `src/lib/db/queries/attempts.ts` — replaced inline UPDATE, removed unused `learningPlans` import
- `src/features/plans/lifecycle/plan-operations.ts` — replaced hardcoded INSERT defaults with shared const
- `tests/unit/db/plan-generation-status.spec.ts` — NEW: 4 unit tests
- `docs/technical-debt.md` — marked debt item resolved

**Behavioral contract unchanged:**
- Same transaction boundaries in `reserveAttemptSlot` (advisory lock + JWT reapply preserved)
- Same INSERT columns in `atomicCheckAndInsertPlan`
- `isQuotaEligible` intentionally NOT added to UPDATE helper (retry semantics preserved)
- Dependency direction `features/ → lib/` maintained (no `lib/ → features/` imports)
