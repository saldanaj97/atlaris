# Security Boundary Update (Issue #282)

## Summary

Remove dangerous `getDb()` defaults from `dbClient` parameters in `plan-operations.ts` and related files. This forces callers to be explicit about RLS context, preventing silent security bypass. All production callers already pass `dbClient` explicitly, so the production code change is zero -- only function signatures and test call sites need updating.

## Scope

**Primary file:** `src/features/plans/lifecycle/plan-operations.ts`

- `checkPlanLimit` (line 40)
- `atomicCheckAndInsertPlan` (line 108)
- `markPlanGenerationSuccess` (line 167)
- `markPlanGenerationFailure` (line 193)

**Secondary file:** `src/app/api/v1/plans/stream/helpers.ts`

- `safeMarkPlanFailed` (line 421) -- same `= getDb()` default pattern

**Type cleanup:** Replace local `type DbClient` with canonical `import type { DbClient } from '@/lib/db/types'`

**Defensive check:** Add runtime guard on `TIER_LIMITS[tier]` access in `atomicCheckAndInsertPlan`

## Plan

- [ ] 1. Remove `= getDb()` defaults from all 4 functions in `plan-operations.ts`
- [ ] 2. Replace local `DbClient` type with canonical import from `@/lib/db/types`
- [ ] 3. Add defensive runtime guard for `TIER_LIMITS[tier]` lookup
- [ ] 4. Remove `= getDb()` default from `safeMarkPlanFailed` in `stream/helpers.ts`
- [ ] 5. Update test call sites to pass `db` (service-role) explicitly:
  - [ ] 5a. `tests/integration/stripe/usage.spec.ts` -- 7 `checkPlanLimit` calls
  - [ ] 5b. `tests/integration/db/usage.spec.ts` -- 1 `atomicCheckAndInsertPlan` call
  - [ ] 5c. `tests/integration/plans/plan-limit-race-condition.spec.ts` -- ~10 `atomicCheckAndInsertPlan` calls
- [ ] 6. Run affected tests to verify they pass
- [ ] 7. Run lint, type-check, and build to verify no regressions
- [ ] 8. Code review pass
- [ ] 9. Commit only our changes, close issue #282

## Impact Assessment

- **Production code changes:** None needed (all prod callers already pass `dbClient`)
- **Test code changes:** ~18 call sites need explicit `db` argument
- **Risk:** Low -- purely additive type safety, no runtime behavior change in production
