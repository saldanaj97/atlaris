# PRD 2: Complete Plan Domain Consolidation

**Status:** Completed (historical)
**Depends on:** PRD 1 (shared layer must exist for tier-limits types)
**Last Updated:** March 2026

Historical note: this PRD captures the stage where plan lifecycle logic was first moved out of `src/features/billing/usage.ts`. That file was later split further and then deleted, so references here to `billing/usage.ts` describe the migration state at that time rather than the current end state.

## Problem

The codebase restructure moved many plan-related files into `src/features/plans/` (from 2 files / 91 lines to 13 files / 1,662 lines). At the time of this PRD, core plan lifecycle operations still lived in `src/features/billing/usage.ts` -- a 850-line god module whose name misled developers into thinking everything inside was billing logic.

Specifically, these functions in `features/billing/usage.ts` are plan domain operations that have zero interaction with the Stripe SDK:

| Function                      | Lines   | What it actually does                                     |
| ----------------------------- | ------- | --------------------------------------------------------- |
| `atomicCheckAndInsertPlan`    | 355-413 | Locks user row, checks plan quota, inserts plan record    |
| `markPlanGenerationSuccess`   | 415-431 | Updates plan status to `ready` and sets `isQuotaEligible` |
| `markPlanGenerationFailure`   | 437-452 | Updates plan status to `failed`                           |
| `checkPlanDurationCap`        | 820-848 | Pure function: checks weeks/hours against tier limits     |
| `countPlansContributingToCap` | 319-342 | Counts plans that consume quota (internal helper)         |
| `checkPlanLimit`              | 102-115 | Checks if user can create more plans                      |

These functions represent the plan lifecycle state machine (create -> generating -> ready/failed) and plan quota enforcement. They belong in the plans domain, not in billing.

## Goal

Move plan lifecycle operations from `features/billing/usage.ts` to `features/plans/`, reducing billing/usage.ts to genuine billing/quota primitives. After this change:

- `features/billing/` owns: tier resolution, usage metrics CRUD, atomic usage increment/decrement
- `features/plans/` owns: plan creation orchestration, generation status transitions, duration cap enforcement

## Scope

### In scope

1. Create `src/features/plans/lifecycle.ts` for plan lifecycle operations
2. Create `src/features/plans/errors.ts` for plan-specific error classes
3. Move 6 functions + 2 error classes from billing to plans
4. Update all consumers (2 production files, 4 test files)
5. Remove deprecated functions from billing if they become dead code

### Out of scope

- Breaking up `billing/usage.ts` further (covered by PRD 3)
- Breaking up `attempts-helpers.ts` (covered by PRD 3)
- Shared layer creation (covered by PRD 1)
- `db/usage.ts` coupling to billing (covered by PRD 1)

## Design

### New file: `src/features/plans/lifecycle.ts`

This file becomes the authority for plan lifecycle state transitions and plan quota enforcement.

**Moved from `billing/usage.ts`:**

```
atomicCheckAndInsertPlan(userId, planData, dbClient)
  → calls billing.resolveUserTier (for tier lookup)
  → calls billing.TIER_LIMITS (for limit value)
  → owns the transaction, locking, plan INSERT, and quota counting

markPlanGenerationSuccess(planId, dbClient, now)
  → pure plan status mutation, no billing dependencies

markPlanGenerationFailure(planId, dbClient, options)
  → pure plan status mutation, no billing dependencies

checkPlanDurationCap(params)
  → pure function: checks tier.maxWeeks and tier.maxHours
  → TIER_RECOMMENDATION_THRESHOLD_WEEKS constant moves here too

checkPlanLimit(userId, dbClient)
  → calls resolveUserTier + countPlansContributingToCap

countPlansContributingToCap(dbOrTx, userId)
  → internal helper (not exported from billing; export from plans if needed)
```

**Dependency direction:**

```
features/plans/lifecycle.ts
  ├── @/features/billing/tier-limits   (TIER_LIMITS constant, SubscriptionTier type)
  ├── @/features/billing/tier          (resolveUserTier)
  ├── @/lib/db/runtime                 (getDb)
  ├── @/lib/db/schema                  (learningPlans, users, usageMetrics)
  ├── @/lib/logging/logger
  └── ./errors                         (PlanLimitReachedError, PlanCreationError)
```

This is the correct direction: `features/plans/` imports from `features/billing/` for tier primitives. Billing does not import from plans.

### New file: `src/features/plans/errors.ts`

Move plan-specific error classes from `features/billing/errors.ts`:

```typescript
// src/features/plans/errors.ts
import { AppError } from '@/lib/api/errors';

export class PlanLimitReachedError extends AppError {
  constructor(
    currentCount?: number,
    limit?: number,
    details?: Record<string, unknown>
  ) {
    super('Plan limit reached for current subscription tier.', {
      status: 403,
      code: 'PLAN_LIMIT_REACHED',
      details:
        currentCount !== undefined || limit !== undefined
          ? { currentCount, limit, ...(details ?? {}) }
          : details,
      classification: 'rate_limit',
    });
  }
}

export class PlanCreationError extends AppError {
  constructor(details?: unknown) {
    super('Failed to create plan.', {
      status: 500,
      code: 'PLAN_CREATION_FAILED',
      details,
    });
  }
}
```

**Remaining in `features/billing/errors.ts`:**

- `UserNotFoundError` -- not plan-specific; used by billing quota operations
- `UsageMetricsLockError` -- billing infrastructure
- `UsageMetricsLoadError` -- billing infrastructure

### Changes to `features/billing/usage.ts`

After extraction, the following are **removed** from billing/usage.ts:

- `atomicCheckAndInsertPlan` (function + its internal types)
- `markPlanGenerationSuccess`
- `markPlanGenerationFailure`
- `checkPlanDurationCap` (function + `PlanDurationCapResult` type + `TIER_RECOMMENDATION_THRESHOLD_WEEKS` constant)
- `countPlansContributingToCap` (internal helper)
- `checkPlanLimit`
- Imports of `PlanCreationError` and `PlanLimitReachedError` from `./errors`
- Import of `PdfContext` type (only used by `atomicCheckAndInsertPlan`)

**Remaining in billing/usage.ts** (genuine billing operations):

- `resolveUserTier` -- tier lookup
- `getOrCreateUsageMetrics` -- internal helper
- `getCurrentMonth` -- internal helper
- `incrementUsage` -- usage counter increment
- `incrementPdfPlanUsage` -- PDF usage increment
- `getUsageSummary` -- usage dashboard data
- `atomicCheckAndIncrementUsage` -- atomic regeneration/export quota
- `atomicCheckAndIncrementPdfUsage` -- atomic PDF quota
- `decrementPdfPlanUsage` -- rollback helper
- `decrementRegenerationUsage` -- rollback helper
- `ensureUsageMetricsExist` -- internal helper
- `incrementUsageInTx` -- internal helper
- `incrementPdfUsageInTx` -- internal helper
- `decrementUsageColumn` -- internal helper
- Re-exports of `TIER_LIMITS` and `SubscriptionTier`

Also remove deprecated functions if they have no consumers:

- `checkRegenerationLimit` (deprecated, use `atomicCheckAndIncrementUsage`)
- `checkExportLimit` (deprecated, use `atomicCheckAndIncrementUsage`)
- `checkPdfPlanQuota` (deprecated, use `atomicCheckAndIncrementPdfUsage`)

**Estimated size reduction:** billing/usage.ts drops from ~850 lines to ~500 lines.

### Consumer updates

#### Production code (2 files)

1. **`src/features/plans/api/preflight.ts`**

   Current:

   ```typescript
   import {
     atomicCheckAndInsertPlan,
     checkPlanDurationCap,
     resolveUserTier,
   } from '@/features/billing/usage';
   ```

   After:

   ```typescript
   import {
     atomicCheckAndInsertPlan,
     checkPlanDurationCap,
   } from '@/features/plans/lifecycle';
   import { resolveUserTier } from '@/features/billing/usage';
   ```

2. **`src/app/api/v1/plans/stream/helpers.ts`**

   Current:

   ```typescript
   import {
     markPlanGenerationFailure,
     markPlanGenerationSuccess,
   } from '@/features/billing/usage';
   ```

   After:

   ```typescript
   import {
     markPlanGenerationFailure,
     markPlanGenerationSuccess,
   } from '@/features/plans/lifecycle';
   ```

   Note: This file already uses DI (`StreamingHelperDependencies`) for these functions, so the `typeof` references also update to point to plans/lifecycle. The DI pattern makes this safe -- tests inject mocks regardless of the import source.

#### Test files (4 files)

1. **`tests/unit/stripe/usage.caps.spec.ts`**
   - Update import: `checkPlanDurationCap` from `@/features/plans/lifecycle`
   - Consider renaming file to `tests/unit/plans/duration-caps.spec.ts`

2. **`tests/integration/plans/plan-limit-race-condition.spec.ts`**
   - Update import: `atomicCheckAndInsertPlan` from `@/features/plans/lifecycle`

3. **`tests/integration/db/usage.spec.ts`**
   - Update import: `atomicCheckAndInsertPlan` from `@/features/plans/lifecycle`

4. **`tests/unit/ai/streaming/helpers.spec.ts`**
   - Update type references for `StreamingHelperDependencies['markPlanGenerationFailure']` etc.
   - These should work without changes since the function signatures don't change

### Re-export strategy (optional, for migration safety)

To avoid a breaking change in one step, billing/usage.ts can temporarily re-export the moved functions:

```typescript
// Temporary re-exports for backward compatibility (remove in follow-up PR)
export {
  atomicCheckAndInsertPlan,
  markPlanGenerationSuccess,
  markPlanGenerationFailure,
  checkPlanDurationCap,
} from '@/features/plans/lifecycle';
```

This is optional. The consumer surface is small enough (2 production files, 4 tests) that a direct migration without re-exports is preferable.

## Implementation order

1. Create `src/features/plans/errors.ts` with `PlanLimitReachedError` and `PlanCreationError`
2. Create `src/features/plans/lifecycle.ts` with all 6 functions
3. Update `src/features/billing/errors.ts` to remove moved error classes
4. Update `src/features/billing/usage.ts` to remove moved functions and internal helpers
5. Update `src/features/plans/api/preflight.ts` imports
6. Update `src/app/api/v1/plans/stream/helpers.ts` imports
7. Update test file imports
8. Run `pnpm type-check && pnpm test:changed` to verify
9. Optionally remove deprecated functions from billing/usage.ts if no consumers remain
10. Optionally rename test file `tests/unit/stripe/usage.caps.spec.ts`

## Verification

- `pnpm type-check` passes
- `pnpm test` passes (unit + integration for changed files)
- `pnpm lint` passes
- No circular dependencies between `features/plans/` and `features/billing/`
- `billing/usage.ts` has no imports from `features/plans/`
- `plans/lifecycle.ts` imports from `features/billing/` only for tier primitives (`resolveUserTier`, `TIER_LIMITS`, `SubscriptionTier`)

## Resulting directory structure

```
src/features/plans/
├── api/
│   ├── preflight.ts        # Plan creation preflight (imports lifecycle.ts)
│   ├── pdf-origin.ts       # PDF origin handling
│   ├── route-context.ts    # Request context helpers
│   └── shared.ts           # Duration normalization, week calculation
├── validation/
│   ├── shared.ts
│   ├── learningPlans.ts
│   └── learningPlans.types.ts
├── lifecycle.ts             # NEW: plan creation, status transitions, duration caps
├── errors.ts                # NEW: PlanLimitReachedError, PlanCreationError
├── create-mapper.ts
├── detail-mapper.ts
├── effort.ts
├── formatters.ts
├── metrics.ts
└── status.ts
```

## Risk assessment

**Low risk.** This is a pure code relocation with no behavioral changes:

- Function signatures remain identical
- Transaction semantics unchanged
- Error types unchanged
- The consumer surface is small (2 production files, 4 tests)
- DI patterns in stream/helpers.ts make the transition safe for tests

The only subtle risk is ensuring `countPlansContributingToCap` remains accessible to any billing function that still needs it. Checking the code: only `checkPlanLimit` and `atomicCheckAndInsertPlan` call it, and both are moving. No risk.

## Follow-up improvements (post-relocation)

Code review surfaced pre-existing issues in the relocated functions. These were carried over verbatim during the move and should be addressed as a follow-up slice to improve robustness.

### 1. `PlanCreationError` — loose `details` type

**File:** `src/features/plans/errors.ts` (lines 32–39)

The constructor accepts `details?: unknown` while `PlanLimitReachedError` uses `details?: Record<string, unknown>`. Tighten the type to `Record<string, unknown>` for consistency across plan error classes.

### 2. `countPlansContributingToCap` — unsafe type assertion

**File:** `src/features/plans/lifecycle/plan-operations.ts` (line 89)

`(result?.count as number) ?? 0` bypasses type safety. Replace with explicit validation: check for null/undefined, handle bigint→number conversion, and fall back to 0 on invalid values instead of relying on `as number`.

### 3. `markPlanGenerationSuccess` — silent no-op on missing plan

**File:** `src/features/plans/lifecycle/plan-operations.ts` (lines 159–175)

The update silently succeeds even if no rows were changed (e.g. invalid planId). Capture the update result, verify exactly one row was affected, and throw an error with the planId if not.

### 4. `markPlanGenerationFailure` — same silent no-op + inconsistent signature

**File:** `src/features/plans/lifecycle/plan-operations.ts` (lines 177–192)

Same silent-update issue as `markPlanGenerationSuccess`. Additionally, uses `MarkPlanFailureOptions` wrapper type while `markPlanGenerationSuccess` takes `now` as a direct parameter. Align the signatures and add row-count verification.

### 5. `checkPlanDurationCap` — unnecessary `String()` wrappers

**File:** `src/features/plans/lifecycle/plan-operations.ts` (line 217)

`${String(params.tier)}` and `${String(caps.maxHours)}` are redundant in template literals. Remove the `String()` calls.

### 6. `atomicCheckAndInsertPlan` — tier resolution inconsistency

**File:** `src/features/plans/lifecycle/plan-operations.ts` (lines 130–131)

`atomicCheckAndInsertPlan` reads `user.subscriptionTier` directly from the locked row, while `checkPlanLimit` calls `resolveUserTier()`. Both are correct in their respective contexts (atomic vs. non-atomic), but documenting the intentional divergence with a code comment would prevent future confusion.
