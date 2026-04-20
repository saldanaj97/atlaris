# Issue #307 — Deepen Plans Persistence Ports Over Drizzle Chains

> **Parent issue:** [#307 — RFC: deepen plans persistence ports over Drizzle chains](https://github.com/saldanaj97/atlaris/issues/307)
> **Research date:** 2026-04-20
> **Status:** Research complete — ready for implementation planning

---

## Slice A — Extract pure duration policy from mixed DB modules

### 1. Current State

- `src/features/plans/lifecycle/plan-operations.ts:32-206` contains DB-backed lifecycle helpers (`checkPlanLimit`, `atomicCheckAndInsertPlan`, `markPlanGenerationSuccess`, `markPlanGenerationFailure`), but the same file also exports pure `checkPlanDurationCap` at `208-233`.
- `src/features/plans/api/shared.ts:15-114` contains pure `calculateTotalWeeks` and `normalizePlanDurationForTier`, but the file also exports DB-backed `findCappedPlanWithoutModules` at `116-140`.
- `src/features/plans/lifecycle/adapters/quota-adapter.ts:7-42` imports pure duration helpers from both mixed modules.
- `src/features/plans/lifecycle/creation-pipeline.ts:1-2,73-108` imports `calculateTotalWeeks` from `api/shared` before running `QuotaPort.checkDurationCap` and `QuotaPort.normalizePlanDuration`.
- **Gap:** pure duration policy has no DB-free home, so quota/lifecycle code must reach into modules whose names and dependencies imply persistence or API concerns.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/features/plans/lifecycle/plan-operations.ts` | Remove exported pure duration-cap policy from the DB helper module | 208-233 |
| `src/features/plans/api/shared.ts` | Move pure duration helpers out of the mixed API/query module | 15-114 |
| `src/features/plans/lifecycle/adapters/quota-adapter.ts` | Point imports at the DB-free policy module (both `normalizePlanDurationForTier` and `checkPlanDurationCap`) | 7-42 |
| `src/features/plans/lifecycle/creation-pipeline.ts` | Point `calculateTotalWeeks` import at the DB-free policy module | 1-2, 73-108 |
| `tests/unit/plans/duration-caps.spec.ts` | Retarget `checkPlanDurationCap` import at the new pure policy module, or fold its cases into `tests/unit/features/plans/policy/duration.spec.ts` and delete | 1-2 |

**New files:**

| File | Purpose |
|------|---------|
| `src/features/plans/policy/duration.ts` | Own `calculateTotalWeeks`, `normalizePlanDurationForTier`, and `checkPlanDurationCap` without `DbClient` imports |
| `tests/unit/features/plans/policy/duration.spec.ts` | Cover duration math, cap messages, and normalization edge cases as pure unit tests |

### 3. Implementation Steps (TDD)

1. **Write pure policy tests first:**
   - Test default-week behavior when no deadline is provided.
   - Test deadline clamping by both `maxWeeks` and `maxHours`.
   - Test cap rejection reasons and upgrade URLs per tier.
   - Test UTC normalization so start/deadline math does not drift by local timezone.

2. **Implement the pure policy module:**
   - Create `src/features/plans/policy/duration.ts` and move the three pure helpers there without changing their external behavior.
   - Update `QuotaAdapter` and `creation-pipeline` imports.
   - Remove or stop exporting the old copies once all callers point to the new module.

3. **Validate:**
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/policy/duration.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/lifecycle/service.spec.ts`

### 4. Risk Areas

- **Merge conflict risk:** MEDIUM — `quota-adapter.ts` and `creation-pipeline.ts` are small but central lifecycle files.
- **Behavioral change:** LOW — the main goal is module ownership, not logic changes.
- **Edge cases:** date normalization and `maxHours / weeklyHours` rounding are easy to alter accidentally.
- **Test gap:** there is no dedicated pure policy suite today; behavior is mostly covered indirectly through lifecycle service tests.

### 5. Estimated Overlap

- **With Slice B:** shared adapter import surface; land Slice A first so Slice B can point at the final DB-free policy module.
- **With Slice C:** low overlap.
- **Merge recommendation:** first slice to land.

---

## Slice B — Deepen the persistence adapter/store boundary

### 1. Current State

- `src/features/plans/lifecycle/ports.ts:26-52` already defines the right public persistence surface: `atomicInsertPlan`, `findCappedPlanWithoutModules`, `findRecentDuplicatePlan`, `markGenerationSuccess`, and `markGenerationFailure`.
- `src/features/plans/lifecycle/service.ts:29-173` and `src/features/plans/lifecycle/creation-pipeline.ts:15-20,128-168` already consume persistence through ports instead of `DbClient`.
- `src/features/plans/lifecycle/adapters/plan-persistence-adapter.ts:7-63` is a thin shell over raw helper exports from `plan-operations.ts` and `api/shared.ts`.
- The actual DB logic is still public and split across mixed modules:
  - `checkPlanLimit` — `src/features/plans/lifecycle/plan-operations.ts:32-49`
  - `atomicCheckAndInsertPlan` — `src/features/plans/lifecycle/plan-operations.ts:104-154`
  - `markPlanGenerationSuccess` — `src/features/plans/lifecycle/plan-operations.ts:156-180`
  - `markPlanGenerationFailure` — `src/features/plans/lifecycle/plan-operations.ts:182-206`
  - `findRecentDuplicatePlan` — `src/features/plans/lifecycle/plan-operations.ts:242-265`
  - `findCappedPlanWithoutModules` — `src/features/plans/api/shared.ts:116-140`
- `src/features/plans/lifecycle/factory.ts:26-37` composes the service with a single `PlanPersistenceAdapter`, so there is already one clear composition root to preserve.
- `tests/integration/stripe/usage.spec.ts:4-10,14-189` imports `checkPlanLimit` directly from `plan-operations.ts`, so Slice B needs an explicit plan for that helper instead of letting helper tightening break an unrelated integration suite.
- Additional non-adapter test consumers of the helpers this slice will privatize or relocate:
  - `tests/integration/db/usage.spec.ts` imports `atomicCheckAndInsertPlan` from `@/features/plans/lifecycle/plan-operations`.
  - `tests/integration/plans/plan-limit-race-condition.spec.ts` imports `atomicCheckAndInsertPlan` from the same module.
  - Both must either move to the new `plan-persistence-adapter.spec.ts` coverage (preferred when the assertion is that the adapter/store behaves correctly) or be rewritten to call the port/adapter surface directly; they cannot keep importing the raw helper once the store is adapter-private.
- **Gap:** the adapter does not own a deeper private store, and the raw Drizzle helper functions remain importable by non-adapter code.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/features/plans/lifecycle/adapters/plan-persistence-adapter.ts` | Retarget adapter methods to a private store instead of public raw helpers | 7-63 |
| `src/features/plans/lifecycle/plan-operations.ts` | Move or privatize atomic insert, duplicate lookup, and generation status updates | 104-265 |
| `src/features/plans/api/shared.ts` | Move capped-plan lookup out of the mixed API/query module | 116-140 |
| `tests/integration/stripe/usage.spec.ts` | Update `checkPlanLimit` import if that helper moves out of `plan-operations.ts` | 4-10, 14-189 |
| `tests/integration/db/usage.spec.ts` | Remove direct `atomicCheckAndInsertPlan` import; migrate assertion to the adapter spec or to the port/adapter surface | imports |
| `tests/integration/plans/plan-limit-race-condition.spec.ts` | Remove direct `atomicCheckAndInsertPlan` import; cover race-condition behavior via the new adapter integration spec or the port surface | imports |
| `src/features/plans/lifecycle/ports.ts` | Add derived capability aliases only if consumer wiring benefits from them | 26-52 |
| `src/features/plans/lifecycle/factory.ts` | Keep composition-root wiring aligned if adapter construction changes | 17-37 |
| `src/features/plans/lifecycle/index.ts` | Update exports if helper visibility changes | 1-39 |

**New files:**

| File | Purpose |
|------|---------|
| `src/features/plans/lifecycle/adapters/plan-persistence-store.ts` | Adapter-private Drizzle store for atomic insert, duplicate detection, capped-plan lookup, and generation status transitions |
| `src/features/plans/quota/check-plan-limit.ts` | Dedicated non-lifecycle home for `checkPlanLimit` so Stripe usage tests do not depend on lifecycle persistence internals |
| `tests/integration/features/plans/lifecycle/plan-persistence-adapter.spec.ts` | Real-DB contract coverage for the adapter/store surface |

### 3. Implementation Steps (TDD)

1. **Write adapter integration tests first:**
   - `atomicInsertPlan` succeeds below the cap and returns a rejected result when the cap is hit.
   - `findRecentDuplicatePlan` only returns recent generating/ready plans inside the dedup window.
   - `findCappedPlanWithoutModules` only returns plans that have exhausted the attempt cap and still have no modules.
   - `markGenerationSuccess` and `markGenerationFailure` update `generationStatus`, `isQuotaEligible`, and timestamps as expected.

2. **Implement the private persistence store:**
   - Move the Drizzle-backed helper logic behind `PlanPersistenceAdapter`.
   - Keep `PlanPersistencePort` stable unless a smaller derived capability type is genuinely needed.
   - Pull `findCappedPlanWithoutModules` out of `api/shared.ts` so the adapter owns the whole persistence surface.
   - Relocate `checkPlanLimit` out of `plan-operations.ts` into a non-lifecycle quota/query helper and update `tests/integration/stripe/usage.spec.ts` to import from that new home instead of adding it to `PlanPersistencePort`.

3. **Tighten visibility and imports:**
   - Remove non-adapter imports of the old helper modules.
   - Limit any remaining exported helpers to adapter-local use.
   - Keep `PlanLifecycleService` and origin strategies on the same DTO/port contract.

4. **Validate:**
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/features/plans/lifecycle/plan-persistence-adapter.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/lifecycle/service.spec.ts`

### 4. Risk Areas

- **Merge conflict risk:** HIGH — `plan-operations.ts`, `plan-persistence-adapter.ts`, and `ports.ts` are the main shared boundary files for this feature area.
- **Behavioral change:** MEDIUM — row-locking, cap counting, duplicate detection, and status flags must remain byte-for-byte equivalent in practice.
- **Edge cases:** preserving the transaction shape in `atomicCheckAndInsertPlan` and the `finalizedAt` behavior in `markGenerationSuccess`.
- **Test gap:** there are no existing integration tests for `PlanPersistenceAdapter` or `QuotaAdapter`.

### 5. Estimated Overlap

- **With Slice A:** shared import movement in adapter code; Slice A should land first.
- **With Slice C:** Slice C should target the final capability/store layout introduced here.
- **Merge recommendation:** second slice; blocks Slice C.

---

## Slice C — Migrate session/cleanup consumers and test seams to narrow capabilities

### 1. Current State

- `src/features/plans/session/stream-cleanup.ts:1-49` imports `markPlanGenerationFailure` directly and accepts an `AttemptsDbClient` just to invoke that helper.
- `src/features/plans/session/stream-outcomes.ts:1-114` imports `markPlanGenerationFailure` directly, and it also imports raw `recordUsage` / `canonicalUsageToRecordParams` from `src/lib/db/usage` plus `incrementUsage` from `src/features/billing/usage-metrics.ts:80-104`; `handleFailedGeneration` and `tryRecordUsage` currently bypass the already-existing `UsageRecordingPort` / `UsageRecordingAdapter` path.
- `src/features/plans/cleanup.ts:1-61` imports `markPlanGenerationFailure` directly; `cleanupStuckPlans` opens its own transaction, selects stale plan ids, and then reuses the raw helper with the transaction handle.
- `src/features/plans/session/plan-generation-session.ts:273-289,330-344` is the main caller of `safeMarkPlanFailed(...)`, passing `sessionDbClient` directly today. Any Slice C signature change must thread the new capability through this file or it will not compile.
- Brittle unit seams still encode Drizzle chain order:
  - `tests/unit/features/plans/lifecycle/plan-operations.spec.ts:1-96`
  - `tests/unit/features/plans/cleanup.spec.ts:21-177`
  - `tests/unit/db/plan-generation-status.spec.ts:29-72`
- Better boundary tests already exist and should be used as the model:
  - `tests/unit/features/plans/lifecycle/service.spec.ts:10-238`
  - `tests/unit/features/plans/lifecycle/lifecycle-consolidation.spec.ts:23-220`
- **Gap:** session/cleanup behavior is still expressed in terms of raw helper signatures and transaction-aware Drizzle mocks, not in terms of persistence capabilities.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| `src/features/plans/session/stream-cleanup.ts` | Inject a narrow failure-marking capability instead of a raw helper import | 1-49 |
| `src/features/plans/session/stream-outcomes.ts` | Replace the raw failure helper dependency with a derived persistence capability | 1-114 |
| `src/features/plans/session/plan-generation-session.ts` | Thread the final `PlanGenerationStatusPort` / `UsageRecordingPort` collaborators into the session helpers and fallback error path | 273-289, 330-344 |
| `src/features/plans/cleanup.ts` | Replace raw helper injection with a narrow capability; document whether broader cleanup-store extraction is in or out of scope | 1-61 |
| `src/features/plans/lifecycle/ports.ts` | Add definitive derived capability aliases such as `PlanGenerationStatusPort` for session/cleanup wiring | 26-52 |
| `tests/unit/features/plans/cleanup.spec.ts` | Stop asserting Drizzle chain order as the primary contract | 21-177 |
| `tests/unit/features/plans/lifecycle/plan-operations.spec.ts` | Delete or narrow once duplicate lookup is covered through adapter/store tests | 1-96 |
| `tests/unit/db/plan-generation-status.spec.ts` | Keep only the helper contract if that helper remains public; otherwise narrow or relocate the test | 29-72 |

**New files:**

| File | Purpose |
|------|---------|
| `tests/unit/features/plans/session/stream-cleanup.spec.ts` | Assert logging and failure-marking behavior through a narrow capability |
| `tests/unit/features/plans/session/stream-outcomes.spec.ts` | Assert failure handling and usage behavior without raw helper signatures or Drizzle chains |
| `tests/integration/features/plans/lifecycle/` | New integration test directory for persistence-adapter coverage if the feature folder does not already exist |

### 3. Implementation Steps (TDD)

1. **Write or reshape boundary tests first:**
   - Session helper tests should assert that a failure-marking capability is invoked, not that a particular helper accepted `(planId, dbClient, now?)`.
   - Cleanup tests should assert that stale plan ids are transitioned and logged correctly without treating `.limit(...).for('update')` call order as the core contract.

2. **Introduce and wire narrow capabilities:**
   - Add `type PlanGenerationStatusPort = Pick<PlanPersistencePort, 'markGenerationSuccess' | 'markGenerationFailure'>` and use it as the standard session/cleanup status-mutation seam.
   - Update `stream-cleanup.ts` and `stream-outcomes.ts` to consume `PlanGenerationStatusPort` rather than importing `plan-operations` directly.
   - Migrate `stream-outcomes.ts` usage recording to `UsageRecordingPort` instead of raw `recordUsage` / `incrementUsage` imports.
   - Thread those capabilities through `plan-generation-session.ts`, including the `safeMarkPlanFailed(...)` fallback path.
   - For `cleanup.ts`, decide during Step 0 whether this issue only removes direct helper leakage or also extracts the full stale-plan query path into a deeper store.

3. **Retire brittle helper tests:**
   - Narrow or remove raw helper specs once adapter integration coverage owns the actual DB contract.
   - Keep only tests whose contract remains public and stable.

4. **Validate:**
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/cleanup.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/session/stream-cleanup.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/session/stream-outcomes.spec.ts`

### 4. Risk Areas

- **Merge conflict risk:** MEDIUM — overlaps with session-boundary and cleanup ownership files, but the surface area is smaller than Slice B.
- **Behavioral change:** MEDIUM — preserve existing log-and-swallow behavior in `safeMarkPlanFailed` and `tryRecordUsage`.
- **Edge cases:** cleanup still needs consistent timestamps and transactional safety for stuck-plan batches.
- **Scoping question:** decide explicitly whether `cleanup.ts` should only lose the raw helper import in this issue or fully stop owning transactional selection logic.

### 5. Estimated Overlap

- **With Slice B:** Slice C should not start until the final persistence capability/store surface exists.
- **With Slice A:** none beyond import churn.
- **Merge recommendation:** third slice; depends on Slice B.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Slice A — pure duration policy extraction
  └── Slice B — private persistence store + adapter deepening
        └── Slice C — session/cleanup capability migration + test realignment
```

**Rationale:** Slice A removes non-DB logic from mixed modules without changing the port contract. Slice B then consolidates the persistence surface behind the existing adapter while preserving `PlanLifecycleService`. Slice C can finally target stable narrow capability types instead of chasing helper signatures that are still moving.

### Shared File Map

| File | Slice A | Slice B | Slice C |
|------|---------|---------|---------|
| `src/features/plans/lifecycle/ports.ts` | — | ✅ possible derived types | ✅ capability wiring |
| `src/features/plans/lifecycle/adapters/quota-adapter.ts` | ✅ primary | — | — |
| `src/features/plans/lifecycle/adapters/plan-persistence-adapter.ts` | — | ✅ primary | ✅ consumer target |
| `src/features/plans/lifecycle/plan-operations.ts` | ✅ remove pure policy | ✅ privatize/move DB helpers | — |
| `src/features/plans/api/shared.ts` | ✅ move pure helpers | ✅ move capped-plan query | — |
| `src/features/plans/session/stream-cleanup.ts` | — | — | ✅ primary |
| `src/features/plans/session/stream-outcomes.ts` | — | — | ✅ primary |
| `src/features/plans/cleanup.ts` | — | — | ✅ primary |
| `tests/unit/features/plans/cleanup.spec.ts` | — | — | ✅ primary |
| `tests/integration/features/plans/lifecycle/plan-persistence-adapter.spec.ts` | — | ✅ primary | — |

### Out-of-Scope / Guardrails

- Do **not** conflate generation-lifecycle status derivation with summary/read-model status derivation; repo learnings explicitly call out that split.
- Leave read-service and read-model consumers alone unless the implementation uncovers a direct dependency on the leaking persistence helpers.
- Preserve the current `PlanLifecycleService` public contract and the `createPlanLifecycleService({ dbClient, jobQueue })` composition root.
- Prefer the narrowest capability type that satisfies session/cleanup needs; avoid widening ports just to mirror helper signatures.
- Because `UsageRecordingAdapter` already wraps `recordUsage` + `incrementUsage` on the same DB connection (`src/features/plans/lifecycle/adapters/usage-recording-adapter.ts:24-68`), Slice C should reuse that seam instead of inventing a parallel usage helper contract.
