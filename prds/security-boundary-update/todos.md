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

- [x] 1. Remove `= getDb()` defaults from all 4 functions in `plan-operations.ts` *(already done)*
- [x] 2. Replace local `DbClient` type with canonical import in `plan-operations.ts` *(already done)*
- [x] 3. Add defensive runtime guard for `TIER_LIMITS[tier]` lookup *(already done)*
- [x] 4. Remove `= getDb()` default from `safeMarkPlanFailed` in `stream/helpers.ts` *(already done)*
- [x] 5. Update test call sites to pass `db` (service-role) explicitly *(already done)*:
  - [x] 5a. `tests/integration/stripe/usage.spec.ts` -- 7 `checkPlanLimit` calls
  - [x] 5b. `tests/integration/db/usage.spec.ts` -- 1 `atomicCheckAndInsertPlan` call
  - [x] 5c. `tests/integration/plans/plan-limit-race-condition.spec.ts` -- ~10 `atomicCheckAndInsertPlan` calls
- [x] 6. Fix local `DbClient` type in `src/features/plans/api/pdf-origin.ts` → canonical import
- [x] 7. Run lint, type-check, and build to verify no regressions *(type-check, lint, `pnpm test:changed` passed; `pnpm build` fails locally with `LOCAL_PRODUCT_TESTING cannot be enabled in production` — env/config, unrelated to this change)*
- [x] 8. Code review pass
- [x] 9. Commit only our changes, close issue #282

## Review (2026-04-01)

- **Change:** Canonical `DbClient` import in `pdf-origin.ts`; removed local `ReturnType<typeof getDb>` alias.
- **Verification:** `pnpm run type-check`, `pnpm run lint`, `pnpm test:changed` all green.

## Impact Assessment

- **Production code changes:** One import swap in `pdf-origin.ts`
- **Test code changes:** None needed (all already correct)
- **Risk:** Extremely low — cosmetic type import change, no runtime behavior change
