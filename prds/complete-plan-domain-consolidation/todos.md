# Complete Plan Domain Consolidation — Todos

**PRD:** `prds/complete-plan-domain-consolidation/prd.md`
**Parent Issue:** [#256](https://github.com/saldanaj97/atlaris/issues/256)
**Status:** Complete

## Summary

Move plan lifecycle operations from `features/billing/usage.ts` to `features/plans/`, reducing billing/usage.ts from ~850 lines to ~500 lines. Pure code relocation — no behavioral changes.

Follow-up note: the temporary post-split billing barrel has since been removed in `prds/remove-billing-usage-barrel/todos.md`, so references to `src/features/billing/usage.ts` here describe historical migration steps rather than the current end state.

---

## Slice 1: Extract plan domain files — [#259](https://github.com/saldanaj97/atlaris/issues/259)

**Branch:** `refactor/extract-plan-domain-files`
**Blocked by:** Nothing — can start immediately

### Tasks

- [x] **Create `src/features/plans/errors.ts`**
  - Move `PlanLimitReachedError` (status 403, code `PLAN_LIMIT_REACHED`) from `billing/errors.ts`
  - Move `PlanCreationError` (status 500, code `PLAN_CREATION_FAILED`) from `billing/errors.ts`
  - Both must extend `AppError` with identical constructor signatures

- [x] **Create `src/features/plans/lifecycle.ts`**
  - Move `atomicCheckAndInsertPlan` — locks user row, checks plan quota, inserts plan record
  - Move `markPlanGenerationSuccess` — updates plan status to `ready`, sets `isQuotaEligible`
  - Move `markPlanGenerationFailure` — updates plan status to `failed`
  - Move `checkPlanDurationCap` — pure function: checks weeks/hours against tier limits
  - Move `countPlansContributingToCap` — counts plans that consume quota (internal helper)
  - Move `checkPlanLimit` — checks if user can create more plans
  - Move `TIER_RECOMMENDATION_THRESHOLD_WEEKS` constant
  - Move `PlanDurationCapResult` type
  - Move `PdfContext` type (only used by `atomicCheckAndInsertPlan`)

- [x] **Update `src/features/billing/errors.ts`**
  - Remove `PlanLimitReachedError` and `PlanCreationError` class definitions
  - Add temporary re-exports: `export { PlanLimitReachedError, PlanCreationError } from '@/features/plans/errors'`

- [x] **Update `src/features/billing/usage.ts`**
  - Remove all 6 functions + internal types/constants listed above
  - Add temporary re-exports pointing to `@/features/plans/lifecycle`
  - File should drop from ~850 to ~500 lines

- [x] **Verify dependency direction**
  - `plans/lifecycle.ts` imports from `billing/` only for: `resolveUserTier`, `TIER_LIMITS`, `SubscriptionTier`
  - `billing/` does NOT import from `plans/` (no circular deps)

- [x] **Run verification:** `pnpm type-check && pnpm test`

---

## Slice 2: Migrate consumers and complete cleanup — [#268](https://github.com/saldanaj97/atlaris/issues/268)

**Branch:** `refactor/migrate-plan-lifecycle-consumers`
**Blocked by:** Slice 1 (#259)

### Tasks

- [x] **Update production imports (2 files)**
  - `src/features/plans/api/preflight.ts` — import `atomicCheckAndInsertPlan`, `checkPlanDurationCap` from `@/features/plans/lifecycle` (keep `resolveUserTier` from billing)
  - `src/app/api/v1/plans/stream/helpers.ts` — import `markPlanGenerationFailure`, `markPlanGenerationSuccess` from `@/features/plans/lifecycle`

- [x] **Update test imports (4 files)**
  - `tests/unit/stripe/usage.caps.spec.ts` — update `checkPlanDurationCap` import
  - `tests/integration/plans/plan-limit-race-condition.spec.ts` — update `atomicCheckAndInsertPlan` import
  - `tests/integration/db/usage.spec.ts` — update `atomicCheckAndInsertPlan` import
  - `tests/unit/ai/streaming/helpers.spec.ts` — verify DI type refs work (should be automatic)

- [x] **Remove temporary re-exports**
  - Remove re-exports from `src/features/billing/usage.ts`
  - Remove re-exports from `src/features/billing/errors.ts`

- [x] **Remove deprecated functions from `billing/usage.ts`** ✅
  - Removed all 3 deprecated functions + associated types (`PdfQuotaDependencies`, `PdfUsageMetrics`)
    - `checkRegenerationLimit` (deprecated → `atomicCheckAndIncrementUsage`)
    - `checkExportLimit` (deprecated → `atomicCheckAndIncrementUsage`)
    - `checkPdfPlanQuota` (deprecated → `atomicCheckAndIncrementPdfUsage`)
  - Removed corresponding test blocks from integration and unit tests
  - Replaced e2e `checkPdfPlanQuota` usage with local `hasPdfQuota` helper
  - Committed to develop via `chore/remove-deprecated-billing-functions` (2086fb2)

- [x] **Relocate test file**
  - `tests/unit/stripe/usage.caps.spec.ts` → `tests/unit/plans/duration-caps.spec.ts`

- [x] **Run full verification:** `pnpm type-check && pnpm test && pnpm lint`

- [x] **Final grep audit**
  - Confirm no remaining imports of moved symbols from `@/features/billing/usage` or `@/features/billing/errors`
  - Confirm `billing/` does NOT import from `features/plans/`
  - ~~Confirm `billing/usage.ts` is ~500 lines or fewer~~ — now ~555 lines after deprecated function removal

---

## Consolidation Note

Originally decomposed into 4 sequential issues (#259 → #264 → #268 → #270). Consolidated to 2 vertical slices since this is a pure code relocation with no behavioral changes and a small consumer surface (2 production files, 4 tests). Issues #264 and #270 were closed and absorbed into #259 and #268 respectively.

---

## Slice 3: Post-relocation hardening

**Branch:** `refactor/extract-plan-domain-files` (same branch as Slices 1 & 2)
**Blocked by:** Slices 1 & 2

Pre-existing issues surfaced by code review during the relocation. All items are in `src/features/plans/lifecycle/plan-operations.ts` or `src/features/plans/errors.ts`.

### Tasks

- [x] **Tighten `PlanCreationError` details type**
  - `src/features/plans/errors.ts` — change constructor param from `details?: unknown` to `details?: Record<string, unknown>` to match `PlanLimitReachedError`

- [x] **Replace unsafe type assertion in `countPlansContributingToCap`**
  - `plan-operations.ts` line 89 — replace `(result?.count as number) ?? 0` with explicit validation (null check, `Number()` conversion, NaN guard, fallback to 0)

- [x] **Add row-count verification to `markPlanGenerationSuccess`**
  - `plan-operations.ts` — capture `.returning()` result from the update, log warning if 0 rows updated

- [x] **Add row-count verification to `markPlanGenerationFailure` + align signature**
  - `plan-operations.ts` — same row-count check as above
  - Replace `MarkPlanFailureOptions` wrapper with a direct `now?: () => Date` parameter to match `markPlanGenerationSuccess` signature

- [x] **Remove unnecessary `String()` wrappers in `checkPlanDurationCap`**
  - `plan-operations.ts` line 217 — remove `String(params.tier)` and `String(caps.maxHours)` from the template literal

- [x] **Document tier resolution divergence in `atomicCheckAndInsertPlan`**
  - `plan-operations.ts` lines 130–131 — add code comment explaining why this reads `user.subscriptionTier` directly (inside FOR UPDATE lock) vs. `checkPlanLimit` calling `resolveUserTier()` (outside transaction)

- [x] **Run verification:** `pnpm type-check && pnpm test && pnpm lint`
