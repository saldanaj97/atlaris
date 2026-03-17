# Fix Dependency Direction Violations — Todos

> **PRD:** [`prds/fix-dependency-direction-violations/prd.md`](./prd.md)
> **Parent Issue:** [#243 — PRD: Fix Dependency Direction Violations](https://github.com/saldanaj97/atlaris/issues/243)
> **Status:** Complete — all issues resolved except known cross-PRD exception (#245)

## Current State

| Metric                              | Value                                     |
| ----------------------------------- | ----------------------------------------- |
| Total `lib/ → features/` violations | **2 remaining** (both known exceptions)   |
| `shared/ → lib/` violations         | **3 remaining** (DB-derived type pattern) |
| `shared/ → features/` violations    | **0**                                     |
| `src/shared/` directory             | ✅ Created (`types/` + `constants/`)      |
| `src/types/` directory              | ✅ Deleted (migrated to `shared/`)        |
| ESLint layer enforcement            | ✅ Active with documented exceptions      |

## Prerequisites

- None external. This PRD can begin immediately.
- **Cross-PRD note:** [#245](https://github.com/saldanaj97/atlaris/issues/245) (from the cleanup-inversions PRD) fixes the `attempts.ts → features/plans/metrics` violation. That issue must also complete before ESLint enforcement (#271) can pass.

## Vertical Slices

### Phase 1: Foundation + Independent Fixes

> No blockers. All 4 issues can run in parallel.

---

#### 1. Create `src/shared/` layer and consolidate `src/types/`

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#246](https://github.com/saldanaj97/atlaris/issues/246) |
| **Priority**   | 🔴 CRITICAL — blocks 8 Phase 2 issues                    |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

##### What

Create the foundational `src/shared/` leaf layer and migrate all 6 files from `src/types/` into it.

##### Changes

- [x] Create `src/shared/types/` and `src/shared/constants/` directories with barrel exports
- [x] Move 6 files from `src/types/` → `src/shared/types/`: `client.ts`, `client.types.ts`, `db.ts`, `db.types.ts`, `images.d.ts`, `react-activity.d.ts`
- [x] Update all import paths project-wide from `@/types/` to `@/shared/types/` (62 files, 76 imports)
- [x] Delete `src/types/` directory
- [x] Verify files in `src/shared/` have no imports from `src/features/` (3 type-derivation imports from `lib/db` remain — these are inherent to the DB-derived type pattern and will be addressed by ESLint exceptions in #271)

##### Verification

- `src/shared/types/` contains all 6 files; `src/types/` is deleted.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 2. Fix schema layer violations (PdfContext + GenerationAttemptStatus)

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#249](https://github.com/saldanaj97/atlaris/issues/249) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

##### What

Fix two violations in `src/lib/db/schema/tables/plans.ts`:

- **Violation 3:** Imports `PdfContext` from `features/pdf/context.types`
- **Violation 4:** Imports `GenerationAttemptStatus` from `db/queries/types/plans.types.ts`

##### Changes

- [x] Replace `PdfContext` import with generic `jsonb`/`unknown` type annotation in schema
- [x] Move `GenerationAttemptStatus` type to `src/lib/db/enums.ts`
- [x] Update all consumers of `GenerationAttemptStatus` to import from `db/enums.ts`

##### Verification

- [x] `src/lib/db/schema/tables/plans.ts` has zero imports from `src/features/` or `db/queries/types/`.
- [x] `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 3. Fix `db/usage.ts` → `features/billing` violation

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#251](https://github.com/saldanaj97/atlaris/issues/251) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

##### What

Remove the `incrementUsage` import from `src/lib/db/usage.ts` (line 3), which couples infrastructure DB operations to billing domain logic.

##### Changes

- [x] Remove `incrementUsage` import from `db/usage.ts`
- [x] Make `db/usage.ts` perform only the database write
- [x] Move orchestration of DB write + billing integration to the caller at the feature layer
- [x] Keep `db/usage.ts` as the event-write primitive; no inlining needed yet

##### Verification

- [x] `src/lib/db/usage.ts` has zero imports from `src/features/`.
- [x] Usage aggregation is now orchestrated by `UsageRecordingAdapter` and stream helpers.
- [x] `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 4. Fix feature concern leaks (ModelResolutionError + orchestrator types)

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#254](https://github.com/saldanaj97/atlaris/issues/254) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | Nothing                                                  |

##### What

Fix two feature-to-infrastructure concern leaks:

- **Concern Leak 1:** `features/ai/model-resolver.ts` imports `AppError` (HTTP-aware) from `lib/api/errors`
- **Concern Leak 2:** `features/ai/types/orchestrator.types.ts` uses `typeof import()` patterns referencing `lib/db/`

##### Changes

- [x] Create `ModelResolutionError extends Error` within `features/ai/`
- [x] Replace `AppError` usage in model resolver with `ModelResolutionError`
- [x] Update API route layer to catch `ModelResolutionError` and map to HTTP response
- [x] Replace `typeof import()` patterns with abstract operation interfaces in orchestrator types
- [x] Update wiring at call sites to pass DB functions conforming to the interfaces

##### Verification

- [x] `features/ai/model-resolver.ts` has no imports from `lib/api/errors`.
- [x] `features/ai/types/orchestrator.types.ts` has no `typeof import()` patterns referencing `lib/db/`.
- [x] `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

### Phase 2: Shared Constant & Type Extractions

> All blocked by #246 (need `src/shared/` to exist). Once #246 completes, all 8 issues can run in parallel.

---

#### 5. Extract shared AI model constants

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#258](https://github.com/saldanaj97/atlaris/issues/258) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract `AI_DEFAULT_MODEL`, `isValidModelId`, and the model ID list from `features/ai/ai-models.ts` into `src/shared/constants/ai-models.ts`. Also extract `DEFAULT_ATTEMPT_CAP` from `features/ai/constants.ts` (or place in `shared/constants/generation.ts` per #262).

**Scope expanded:** Audit found `src/lib/db/queries/users.ts` (line 1) also imports `isValidModelId` from `@/features/ai/ai-models`.

##### Changes

- [x] Create `src/shared/constants/ai-models.ts` with model ID list, default model, and validator
- [x] Update `src/lib/config/env.ts` to import from `@/shared/constants/ai-models`
- [x] Update `src/lib/db/queries/users.ts` to import from `@/shared/constants/ai-models`
- [x] Update `features/ai/ai-models.ts` to import and re-export from shared

##### Verification

- `src/lib/config/env.ts` and `src/lib/db/queries/users.ts` have zero imports from `src/features/ai/ai-models`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 6. Extract shared generation policy constants

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#262](https://github.com/saldanaj97/atlaris/issues/262) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract generation policy constants from `features/ai/generation-policy.ts` into `src/shared/constants/generation.ts`.

**Scope expanded:** Audit found `src/lib/api/rate-limit.ts` (line 5) also imports from `@/features/ai/generation-policy`.

##### Changes

- [x] Create `src/shared/constants/generation.ts` with `DEFAULT_ATTEMPT_CAP`, `resolveAttemptCap`, `PLAN_GENERATION_LIMIT`, `PLAN_GENERATION_WINDOW_MINUTES`, `PLAN_GENERATION_WINDOW_MS`, `getPlanGenerationWindowStart`
- [x] Update `src/lib/db/queries/attempts.ts` to import from `@/shared/constants/generation`
- [x] Update `src/lib/db/queries/helpers/attempts-helpers.ts` to import from `@/shared/constants/generation`
- [x] Update `src/lib/api/rate-limit.ts` to import from `@/shared/constants/generation`
- [x] Update `features/ai/generation-policy.ts` — computes `ATTEMPT_CAP` from `attemptsEnv` + `resolveAttemptCap`, re-exports shared constants
- [x] Note: `ATTEMPT_CAP` lives in both `lib/config/env.ts` (for lib consumers) and `features/ai/generation-policy.ts` (for feature consumers + tests) via shared `resolveAttemptCap`

##### Verification

- `attempts.ts`, `attempts-helpers.ts`, and `rate-limit.ts` have zero imports from `features/ai/generation-policy`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 7. Extract shared failure classification

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#265](https://github.com/saldanaj97/atlaris/issues/265) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract `FailureClassification` type and `isRetryableClassification` function from `features/ai/failures.ts` into `src/shared/types/failure-classification.ts`.

##### Changes

- [x] Create `src/shared/types/failure-classification.ts` with type and function
- [x] Update `src/lib/db/queries/attempts.ts` to import from `@/shared/types/failure-classification`
- [x] Update `features/ai/failures.ts` to import and re-export from shared

##### Verification

- `src/lib/db/queries/attempts.ts` has no imports from `features/ai/failures`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 8. Fix `pdf-rate-limit.ts` → billing with dependency injection

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#267](https://github.com/saldanaj97/atlaris/issues/267) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Apply dependency injection to `src/lib/api/pdf-rate-limit.ts` to remove its dependency on `features/billing/`. Move `SubscriptionTier` and `TIER_LIMITS` to the shared layer.

##### Changes

- [x] Move `SubscriptionTier` type to `src/shared/types/billing.types.ts`
- [x] Move `TIER_LIMITS` constant to `src/shared/constants/tier-limits.ts`
- [x] Refactor rate limiting functions — `resolveTier` now required in deps (no optional default)
- [x] Update API route handlers and e2e tests to pass `resolveTier` explicitly
- [x] Remove all `features/billing/` imports from `pdf-rate-limit.ts`

##### Verification

- `src/lib/api/pdf-rate-limit.ts` has zero imports from `src/features/`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 9. Extract shared AI domain types

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#272](https://github.com/saldanaj97/atlaris/issues/272) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract `ParsedModule` and consumed provider types from `features/ai/types/` into `src/shared/types/` to break query layer dependency on AI feature types.

##### Changes

- [x] Move `ParsedModule`, `ParsedTask` to `src/shared/types/ai-parser.types.ts`
- [x] Move `GenerationInput`, `ProviderMetadata`, `ProviderUsage`, `IsoDateString` to `src/shared/types/ai-provider.types.ts`
- [x] Move `PdfContext`, `PdfContextSection`, `PdfContextCaps` to `src/shared/types/pdf-context.types.ts`
- [x] Update `src/lib/db/queries/types/attempts.types.ts` to import from `@/shared/types/`
- [x] Update `src/lib/db/queries/helpers/attempts-helpers.ts` to import from `@/shared/types/`
- [x] Update `features/ai/types/` and `features/pdf/` to import and re-export from shared

##### Verification

- `attempts.types.ts` and `attempts-helpers.ts` have no imports from `features/ai/types/`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 10. Extract shared plans domain types

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#273](https://github.com/saldanaj97/atlaris/issues/273) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract plans domain types and validation schemas consumed by the infrastructure layer into the shared leaf layer.

##### Changes

- [x] Move `EffortNormalizationFlags`, `normalizeEffort`, `normalizeTaskMinutes`, `normalizeModuleMinutes`, `aggregateNormalizationFlags` to `src/shared/constants/effort.ts`
- [x] Move `NOTES_MAX_LENGTH`, `TOPIC_MAX_LENGTH` to `src/shared/constants/learning-plans.ts`
- [x] Update `src/lib/db/queries/types/attempts.types.ts` to import from shared
- [x] Update `src/lib/db/queries/helpers/attempts-helpers.ts` to import from shared
- [x] Note: `openapi.ts → createLearningPlanSchema` left as known exception (complex Zod schema deeply coupled to features)
- [x] Update `features/plans/` to import and re-export from shared

##### Verification

- `attempts.types.ts`, `attempts-helpers.ts`, and `openapi.ts` have no imports from `features/plans/`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 11. Extract shared jobs types and constants

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#274](https://github.com/saldanaj97/atlaris/issues/274) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract jobs domain types and constants consumed by the infrastructure layer into the shared leaf layer.

##### Changes

- [x] Move `JOB_TYPE_MAP`, `JOB_TYPE_VALUES`, `JobTypeValue` to `src/shared/constants/jobs.ts`
- [x] Move all job types (`Job`, `JobType`, `JobStatus`, etc.) to `src/shared/types/jobs.types.ts`
- [x] Update `src/lib/db/enums.ts` to import from shared
- [x] Update `src/lib/db/queries/types/jobs.types.ts` to import from shared
- [x] Update `src/lib/db/queries/helpers/jobs-helpers.ts` to import from shared
- [x] Update `src/lib/db/queries/jobs.ts` to import from shared
- [x] Update `features/jobs/` to import and re-export from shared

##### Verification

- All 4 `lib/` files have zero imports from `features/jobs/`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

#### 12. Extract shared scheduling types

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Issue**      | [#275](https://github.com/saldanaj97/atlaris/issues/275) |
| **Priority**   | 🟡 MEDIUM                                                |
| **Status**     | ✅ Completed                                             |
| **Depends on** | #246                                                     |

##### What

Extract scheduling domain types consumed by the infrastructure layer into the shared leaf layer.

##### Changes

- [x] Move all scheduling types + Zod schemas to `src/shared/types/scheduling.types.ts`
- [x] Update `src/lib/db/queries/types/schedule.types.ts` to import from shared
- [x] Update `src/lib/db/queries/helpers/schedule-helpers.ts` to import from shared
- [x] Update `src/lib/db/queries/schedules.ts` to import from shared
- [x] Update `features/scheduling/types.ts` and `features/scheduling/scheduling.types.ts` to re-export from shared

##### Verification

- All 3 `lib/` files have zero imports from `features/scheduling/`.
- `pnpm type-check && pnpm lint && pnpm test:changed` pass.

---

### Phase 3: ESLint Enforcement

> Blocked by ALL Phase 1 + Phase 2 issues, plus #245 from the cleanup-inversions PRD.

---

#### 13. Add ESLint import restriction rules

|                |                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue**      | [#271](https://github.com/saldanaj97/atlaris/issues/271)                                                                                           |
| **Priority**   | 🟡 MEDIUM                                                                                                                                          |
| **Status**     | ✅ Completed                                                                                                                                       |
| **Depends on** | #246, #249, #251, #254, #258, #262, #265, #267, #272, #273, #274, #275, and [#245](https://github.com/saldanaj97/atlaris/issues/245) (cleanup PRD) |

##### What

Add ESLint rules to enforce the three-layer dependency direction contract, preventing future regressions.

##### Changes

- [x] Add `sharedLayerRestrictedPatterns` and `libLayerRestrictedPatterns` to `eslint.config.mjs`
- [x] Add enforcement blocks for `src/shared/**` (no lib/features) and `src/lib/**` (no features)
- [x] Add documented exceptions for:
  - 3 DB-derived type files in shared (`db.types.ts`, `client.types.ts`, `db.ts`) — allowed to import from `@/lib/db`
  - `attempts.ts` → `features/plans/metrics` (tracked by #245)
  - `openapi.ts` → `features/plans/validation/learningPlans` (Zod schema coupling)
- [x] `pnpm lint` passes with zero violations
- [x] Manually verified test violations trigger the lint rule

##### Verification

- `pnpm lint` passes with zero layer violation errors.
- Manually verify a test violation triggers the lint rule.
- `pnpm type-check && pnpm test:changed` pass.

---

## Dependency Graph

```
Phase 1 (parallel, no blockers):
  #246  Create src/shared/ layer
  #249  Fix schema layer violations
  #251  Fix db/usage.ts → billing
  #254  Fix feature concern leaks

Phase 2 (parallel, all blocked by #246):
  #258  Extract AI model constants (+ users.ts)
  #262  Extract generation policy constants (+ rate-limit.ts)
  #265  Extract failure classification
  #267  Fix pdf-rate-limit.ts with DI
  #272  Extract AI domain types
  #273  Extract plans domain types
  #274  Extract jobs types and constants
  #275  Extract scheduling types

Phase 3 (blocked by ALL above + #245 from cleanup PRD):
  #271  ESLint enforcement

Cross-PRD:
  #245 (cleanup-inversions PRD) ──→ #271
```

## Per-Slice Execution Pattern

Each slice follows the same pattern:

1. Create the new file(s) in `src/shared/` — types/constants only, no business logic
2. Update the original feature file to import and re-export from shared (backward compat)
3. Update infrastructure-layer consumers to import from `@/shared/` directly
4. Run `pnpm type-check` — zero errors
5. Run `pnpm lint` — no unused imports, no circular dependency warnings
6. Run targeted tests — `pnpm test:changed` for affected files
7. Verify no imports from `lib/` or `features/` in new shared files

## Verification Checklist (Post-Completion)

- [x] `grep -r "from '@/features/" src/lib/ --include='*.ts'` returns **2 known exceptions** (attempts.ts → metrics, openapi.ts → learningPlans)
- [x] `grep -r "from '@/features/" src/shared/ --include='*.ts'` returns **zero results**
- [x] `features/ai/model-resolver.ts` does not import from `lib/api/errors`
- [x] `features/ai/types/orchestrator.types.ts` has no `typeof import()` patterns for `lib/db/`
- [x] `src/types/` directory no longer exists
- [x] `pnpm type-check` passes with zero errors
- [x] `pnpm lint` passes with zero violations (including new layer enforcement rules)
- [x] `pnpm test:changed` passes for all affected files (74 test files, 930 tests)
- [x] No behavioral changes — pure refactor

## Notes

- **Scope expanded from PRD:** The original PRD identified 9 violations. A full codebase audit found 13 additional `lib/ → features/` imports across jobs, scheduling, plans, and AI type domains. Four new issues (#272–#275) were created to cover these gaps. Issues #258 and #262 were expanded to include additional files with the same violation pattern.
- **Cross-PRD dependency:** [#245](https://github.com/saldanaj97/atlaris/issues/245) (from the cleanup-inversions-and-dead-code PRD) removes the `attempts.ts → features/plans/metrics` violation by moving metrics recording to the orchestrator. That issue must complete before ESLint enforcement can pass.
- **Interaction with God Modules PRD (#244):** The billing split (Phase 3 of #244) extracts `billing/tier.ts` and `billing/usage-metrics.ts`. If that runs concurrently, import paths for #267 and #251 may shift. Coordinate ordering or rebase as needed.
- **Feature re-exports preserve backward compatibility:** When moving types/constants to `src/shared/`, the original feature files should import and re-export from shared. This avoids updating every feature-layer consumer and keeps the change scoped to infrastructure imports.

## Review notes

### 2026-03-17

- Completed independent Phase 1 slices `#249`, `#251`, and `#254`.
- Validation completed successfully with:
  - `./scripts/test-unit.sh tests/unit/ai/model-resolver.spec.ts`
  - `./scripts/test-unit.sh tests/unit/ai/streaming/helpers.spec.ts`
  - `pnpm type-check`
  - `pnpm lint`
  - `pnpm test:changed`
- Next highest-leverage slice remains `#246` because it unblocks all Phase 2 shared-layer extractions.
- Completed `#246`: created `src/shared/types/` + `src/shared/constants/`, migrated 6 files from `src/types/`, updated 76 imports across 62 files, deleted `src/types/`.
- Note: 3 type-derivation imports from `@/lib/db` remain in the migrated files (`db.types.ts`, `client.types.ts`, `db.ts`) — these are inherent to the DB-derived type pattern and will need ESLint exceptions in #271.
- Validation: `pnpm type-check`, `pnpm lint`, `pnpm test:changed` (56 files, 695 tests) all pass.
- Phase 2 is now unblocked — all 8 shared extraction issues can proceed in parallel.

### 2026-03-17 (continued) — Phase 2 + Phase 3

- Completed all 8 Phase 2 issues: #258, #262, #265, #267, #272, #273, #274, #275.
- Created 12 new shared files:
  - `shared/constants/`: `ai-models.ts`, `generation.ts`, `tier-limits.ts`, `effort.ts`, `learning-plans.ts`, `jobs.ts`
  - `shared/types/`: `failure-classification.ts`, `billing.types.ts`, `pdf-context.types.ts`, `ai-parser.types.ts`, `ai-provider.types.ts`, `jobs.types.ts`, `scheduling.types.ts`
- Key design decisions:
  - `ATTEMPT_CAP` uses shared `resolveAttemptCap()` in both `lib/config/env.ts` (for lib consumers) and `features/ai/generation-policy.ts` (for feature layer + test mocking)
  - `openapi.ts → createLearningPlanSchema` left as exception (complex Zod schema deeply coupled to features)
  - `pdf-rate-limit.ts` `resolveTier` changed from optional to required dep — callers must now provide it explicitly
  - Feature files consistently re-export from shared for backward compatibility
- Completed Phase 3 (#271): ESLint layer enforcement with `sharedLayerRestrictedPatterns` and `libLayerRestrictedPatterns`
  - 3 documented exceptions for DB-derived types in shared
  - 2 documented exceptions for known lib→features violations (#245 cross-PRD, openapi.ts coupling)
  - Verified enforcement catches violations via synthetic test file
- Final validation: `pnpm type-check` ✅, `pnpm lint` ✅, `pnpm test:changed` ✅ (74 test files, 930 tests, 3 skipped)
- Remaining cross-PRD work: #245 (cleanup-inversions PRD) must resolve `attempts.ts → features/plans/metrics` violation
