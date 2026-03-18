# Todos: Remove `src/features/billing/usage.ts` Barrel Re-exports

## Goal

Delete `src/features/billing/usage.ts` and replace every import site with direct module imports so billing usage helpers come from their real owning modules.

## Audit Findings

- Current barrel file only re-exports from `src/features/billing/tier.ts`, `src/features/billing/usage-metrics.ts`, and `src/features/billing/quota.ts`.
- There are 15 current import sites referencing `@/features/billing/usage`.
- The migration is straightforward because there are no current type-only imports, no forwarder re-exports, and no consumers of `__test__`.
- The only real risk is files that currently import symbols that must be split across multiple source modules.

## Direct Replacement Map

### Import from `src/features/billing/tier.ts`

- `resolveUserTier`

### Import from `src/features/billing/usage-metrics.ts`

- `incrementUsage`
- `getUsageSummary`
- `incrementPdfPlanUsage`
- `decrementPdfPlanUsage`
- `decrementRegenerationUsage`

### Import from `src/features/billing/quota.ts`

- `atomicCheckAndIncrementPdfUsage`
- `atomicCheckAndIncrementUsage`

## Files To Update

### Single-destination rewrites

- [x] `tests/integration/stripe/usage.spec.ts`
- [x] `tests/e2e/pdf-to-plan.spec.ts`
- [x] `src/features/plans/lifecycle/plan-operations.ts`
- [x] `src/features/plans/api/preflight.ts`
- [x] `src/app/api/v1/plans/stream/helpers.ts`
- [x] `src/app/api/v1/plans/from-pdf/extract/route.ts`
- [x] `src/features/plans/lifecycle/adapters/usage-recording-adapter.ts`
- [x] `src/app/api/v1/plans/[planId]/retry/route.ts`
- [x] `src/features/jobs/regeneration-worker.ts`
- [x] `src/app/api/v1/user/subscription/route.ts`
- [x] `src/app/plans/components/PlansContent.tsx`
- [x] `src/app/settings/billing/components/BillingCards.tsx`

### Split-import rewrites (highest care)

- [x] `src/features/plans/lifecycle/adapters/quota-adapter.ts`
- [x] `src/features/plans/api/pdf-origin.ts`
- [x] `src/app/api/v1/plans/[planId]/regenerate/route.ts`

## Execution Plan

1. [x] Replace all single-destination imports first so the low-risk majority is cleaned up quickly.
2. [x] Update the 3 split-import files by separating imports between `tier.ts`, `usage-metrics.ts`, and `quota.ts`.
3. [x] Run a repo-wide search for `@/features/billing/usage` to confirm there are no remaining consumers.
4. [x] Delete `src/features/billing/usage.ts`.
5. [x] Run targeted verification: `pnpm type-check`, `pnpm lint`, and `pnpm test:changed`.

## Review Checklist

- [x] No imports remain from `@/features/billing/usage`.
- [x] No code path still depends on barrel-only aliases like `__test__`.
- [x] All updated files import only the symbols they use from concrete source modules.
- [x] Verification commands pass.

## Review

- Completed direct-import migration for all 15 former barrel consumers and deleted `src/features/billing/usage.ts`.
- Corrected the split-import mistakes discovered during verification so decrement helpers now import from `src/features/billing/usage-metrics.ts` and tier resolution imports from `src/features/billing/tier.ts`.
- Final passthrough checks:
  - exact import search for `@/features/billing/usage`: clean
  - `__test__` search in code: no consumers found
  - `pnpm type-check`: passed
  - `pnpm lint`: passed
  - `pnpm test:changed`: passed
