# Break Up God Modules — Todos

> **PRD:** [`prds/break-up-god-modules/prd.md`](./prd.md)
> **Parent Issue:** [#244 — PRD: Break Up God Modules](https://github.com/saldanaj97/atlaris/issues/244)
> **Status:** Phase 1, 2, & 3 complete, including the direct-import follow-up that deleted the temporary billing barrel (PR [#279](https://github.com/saldanaj97/atlaris/pull/279)).

## Current State

| God Module                                       | Original Lines | Target Lines                  | Actual Lines | Status      |
| ------------------------------------------------ | -------------- | ----------------------------- | ------------ | ----------- |
| `src/lib/db/queries/helpers/attempts-helpers.ts` | 530            | ~90 (reduced)                 | 70           | ✅ Complete |
| `src/features/ai/providers/openrouter.ts`        | 611            | ~380 (reduced)                | 340          | ✅ Complete |
| `src/features/billing/usage.ts`                  | 552            | transitional ~20, then delete | deleted      | ✅ Complete |

## Prerequisites

- [x] **PRD 2 — Plan Lifecycle Orchestration** ([#236](https://github.com/saldanaj97/atlaris/issues/236)) — complete. Phase 3 billing split executed on the post-PRD-2 state (552 lines).

## Vertical Slices

### Phase 1: Split `attempts-helpers.ts` (530 → 4 files)

> Can start immediately. Issues are sequential to avoid merge conflicts on the same source file.

- [x] **[#248](https://github.com/saldanaj97/atlaris/issues/248) — Extract `attempts-input.ts`** (~190 lines → 178 actual)
  - Move pure input-preparation functions: `sanitizeInput`, `toPromptHashPayload`, `getPdfProvenance`, `buildMetadata`, `stableSerialize`, and private helpers (`getPdfContextDigest`, `hasPdfProvenanceInput`)
  - External deps reduced to 4 (crypto/hash, truncation, learningPlans constants, provider.types)
  - Consumer: `src/lib/db/queries/attempts.ts`
  - **Blocked by:** nothing

- [x] **[#252](https://github.com/saldanaj97/atlaris/issues/252) — Extract `attempts-rate-limit.ts`** (~55 lines → 56 actual)
  - Move rate-limit window query and retry-after computation: `selectUserGenerationAttemptWindowStats`, `computeRetryAfterSeconds`, and private `userAttemptsSincePredicate`
  - External deps reduced to 2 (db/schema, generation-policy)
  - Consumers: `src/lib/db/queries/attempts.ts`, `src/lib/api/rate-limit.ts`
  - **Blocked by:** #248

- [x] **[#255](https://github.com/saldanaj97/atlaris/issues/255) — Extract `attempts-persistence.ts`** (~200 lines → 232 actual)
  - Move DB transaction and normalization: `persistSuccessfulAttempt`, `normalizeParsedModules`, `assertAttemptIdMatchesReservation`, `isAttemptsDbClient`, and private `ATTEMPTS_DB_METHODS`
  - External deps reduced to 4 (db/schema, db/service-role, plans/effort, parser.types)
  - Consumers: `src/lib/db/queries/attempts.ts`, `src/features/ai/orchestrator.ts`
  - After this, `attempts-helpers.ts` is reduced to ~90 lines (only `isProviderErrorRetryable`, `logAttemptEvent`, `getProviderErrorStatus`)
  - **Blocked by:** #252

### Phase 2: Split `openrouter.ts` (611 → 2 files)

> Can start immediately. Independent of Phase 1 — run in parallel.

- [x] **[#261](https://github.com/saldanaj97/atlaris/issues/261) — Extract `openrouter-response.ts`** (~230 lines → 285 actual)
  - Move response parsing, validation, stream processing: types (`TextPart`, `StreamDeltaLike`, `StreamChoiceLike`, `StreamEventLike`), type guards (`isObjectRecord`, `isAsyncIterable`, `isTextPartArray`, `isUsageShape`), parsing (`parseContent`, `extractChunkText`, `normalizeUsage`), validation (`validateNonStreamingResponse`, `describeResponseValue`, `createInvalidShapeError`), streaming (`streamFromEvents`, `getStatusCodeFromError`), and `USAGE_TOKEN_FIELDS`
  - External deps reduced to 2 (providers/errors, streaming/utils)
  - After this, `openrouter.ts` is reduced to ~380 lines (class + SDK + Sentry instrumentation)
  - **Blocked by:** nothing

### Phase 3: Split `billing/usage.ts` (~500 post-PRD-2 → 3 files + transitional barrel, then delete barrel)

> Historical note: this phase was blocked until PRD 2 ([#236](https://github.com/saldanaj97/atlaris/issues/236)) completed and reduced `usage.ts` from ~850 to ~500 lines. It is now complete.

- [x] **[#263](https://github.com/saldanaj97/atlaris/issues/263) — Extract `billing/tier.ts`** (~25 lines → 32 actual)
  - Move tier resolution: `resolveUserTier`, `getUserTier` alias
  - External deps reduced to 2 (db/runtime, db/schema)
  - Barrel re-export in `usage.ts` — no consumer import changes needed

- [x] **[#266](https://github.com/saldanaj97/atlaris/issues/266) — Extract `billing/usage-metrics.ts`** (~175 lines → 323 actual)
  - Move monthly usage metrics CRUD: `getCurrentMonth`, `getOrCreateUsageMetrics`, `ensureUsageMetricsExist`, `incrementUsage`, `incrementUsageInTx`, `incrementPdfPlanUsage`, `incrementPdfUsageInTx`, `getUsageSummary`, `decrementUsageColumn`, `decrementPdfPlanUsage`, `decrementRegenerationUsage`
  - External deps reduced to 3 (db/runtime, db/schema, logging/logger)
  - Exports `getCurrentMonth`, `ensureUsageMetricsExist`, `incrementUsageInTx`, `incrementPdfUsageInTx` for `quota.ts`

- [x] **[#269](https://github.com/saldanaj97/atlaris/issues/269) — Extract `billing/quota.ts` + convert `usage.ts` to transitional barrel** (~200 lines → 208 actual + 23-line barrel)
  - Move atomic quota enforcement: `atomicCheckAndIncrementUsage`, `atomicCheckAndIncrementPdfUsage`
  - Converted `usage.ts` to a temporary 23-line barrel re-export so the split could land with minimal churn

- [x] **Follow-up — remove the temporary `billing/usage.ts` barrel**
  - Migrated all 15 remaining consumers to direct imports from `billing/tier.ts`, `billing/usage-metrics.ts`, and `billing/quota.ts`
  - Deleted `src/features/billing/usage.ts`
  - Documented in `prds/remove-billing-usage-barrel/todos.md`

## Dependency Graph

```
Phase 1 (attempts):     #248 ──→ #252 ──→ #255
Phase 2 (openrouter):   #261
Phase 3 (billing):      #236 (PRD 2) ──→ #263 ──→ #266 ──→ #269

Parallelism:
  • Phase 1 and Phase 2 can run simultaneously
  • Phase 3 was blocked until PRD 2 completed
```

## Per-Slice Execution Pattern

Each slice follows the same pattern (from PRD §Migration Strategy):

1. Create the new file(s) with extracted functions — preserve JSDoc and inline comments
2. Update the original file to import from the new files (or delete moved code)
3. Update exports (barrel pattern) or update consumer imports directly
4. Run `pnpm type-check` — zero errors
5. Run `pnpm lint` — no unused imports, no circular dependency warnings
6. Run `pnpm test:changed` — all affected tests pass
7. Verify original file's line count matches expectations

## Verification Checklist (Post-Completion)

- [x] `pnpm type-check` passes with zero errors
- [x] `pnpm lint` passes (no unused imports, no circular deps)
- [x] `pnpm test:changed` passes for all affected files (140 passed, 3 skipped)
- [x] Post-split line counts match expectations:
  - `attempts-helpers.ts`: 70 lines (down from 530, target ~90)
  - `openrouter.ts`: 340 lines (down from 611, target ~380)
  - `billing/usage.ts`: deleted after the direct-import follow-up
- [x] No new external dependencies introduced
- [x] All public exports maintain identical signatures and return types
- [x] No unintended behavioral changes from the module split itself; branch-level follow-up also hardened PDF-origin validation by requiring `pdfProofVersion`

## Notes

- **#270** (remove deprecated billing functions) is tracked under PRD #256, not this PRD. The PRD explicitly defers removal to PRD 4. This PRD only _moves_ deprecated functions to `quota.ts`.
- The billing split targets the **post-PRD-2 state** of `usage.ts` (~500 lines). Do not attempt the billing phase against the current 850-line file.
- The barrel re-export was the initial migration tactic, not the final architecture. The follow-up direct-import cleanup has now removed `src/features/billing/usage.ts` entirely.

## Review notes

### 2026-03-18

- Completed the follow-up cleanup that removed the temporary `src/features/billing/usage.ts` barrel.
- Migrated all 15 remaining consumers to direct imports from `billing/tier.ts`, `billing/usage-metrics.ts`, and `billing/quota.ts`.
- Verified with `pnpm type-check`, `pnpm lint`, and `pnpm test:changed`.
