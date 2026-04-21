# Plan: Deepen Plans Persistence Ports Over Drizzle Chains (issue #307)

## Goal

Finish the ports-and-adapters boundary that issue #307 describes: pure duration policy should live in DB-free modules, Drizzle-backed lifecycle persistence should sit behind a private store owned by `PlanPersistenceAdapter`, and lifecycle-adjacent consumers should stop importing raw persistence helpers directly.

## Guardrails

- Preserve the existing `PlanPersistencePort`/`QuotaPort` service contract unless a smaller derived capability type makes helper wiring clearer.
- Do not conflate generation lifecycle state with the separate summary/read-model status derivation layers called out in `docs/agent-context/learnings.md`.
- Keep `createPlanLifecycleService({ dbClient, jobQueue })` as the composition root for lifecycle wiring.
- Prefer supported test commands from repo docs (`pnpm exec tsx scripts/tests/run.ts ...`, `pnpm test:changed`, `pnpm check:full`).

## Step 0.0 — Fetch issue, confirm/add ACs

1. Re-read issue #307 and preserve the public boundary it already proposes:
   - `PlanPersistencePort` remains the lifecycle-facing persistence contract.
   - `PlanGenerationStatusPort` should be the named derived status-mutation capability for session/cleanup wiring, not an optional design choice.
2. Confirm the out-of-scope boundary:
   - Read-service/read-model consumers stay untouched unless they directly import leaking helpers.
   - The minimum cleanup scope is eliminating direct helper leakage; full cleanup-store extraction is optional and should only happen if it cleanly fits issue #307.
   - `stream-outcomes.ts` usage recording is in scope for this issue because it bypasses the existing `UsageRecordingPort` seam.
3. Record the explicit non-lifecycle helper decision:
   - `checkPlanLimit` should not be folded into `PlanPersistencePort`, but it also should not remain a stray export from `plan-operations.ts`.
   - Move it to a dedicated non-lifecycle quota/query helper and update `tests/integration/stripe/usage.spec.ts` accordingly.
4. Verify the implementation order in `research.md` still makes sense against the current tree before editing code.

## Step 1.1 — Extract pure duration policy into a DB-free module

1. Add pure unit coverage first in `tests/unit/features/plans/policy/duration.spec.ts` for:
   - `calculateTotalWeeks`
   - `normalizePlanDurationForTier`
   - `checkPlanDurationCap`
2. Create `src/features/plans/policy/duration.ts` and move the pure helpers out of:
   - `src/features/plans/api/shared.ts`
   - `src/features/plans/lifecycle/plan-operations.ts`
3. Update imports in:
   - `src/features/plans/lifecycle/adapters/quota-adapter.ts` (`normalizePlanDurationForTier`, `checkPlanDurationCap`)
   - `src/features/plans/lifecycle/creation-pipeline.ts` (`calculateTotalWeeks`)
   - `src/features/plans/lifecycle/adapters/plan-persistence-adapter.ts` only if `findCappedPlanWithoutModules` moves in Step 1.2 (tracked there, not here)
4. Reconcile existing duration-cap unit coverage:
   - `tests/unit/plans/duration-caps.spec.ts` currently imports `checkPlanDurationCap` from `@/features/plans/lifecycle/plan-operations`.
   - Either retarget that spec to the new `@/features/plans/policy/duration` module or fold its cases into the new `tests/unit/features/plans/policy/duration.spec.ts` and delete the legacy file; do not leave two specs owning the same pure policy contract.
5. Remove the old exports once no caller depends on them.

## Step 1.2 — Deepen the persistence adapter over a private store

1. Write the adapter integration spec first at `tests/integration/features/plans/lifecycle/plan-persistence-adapter.spec.ts` covering:
   - atomic insert success/quota rejection
   - recent duplicate detection
   - capped-plan lookup
   - generation success/failure transitions
2. Introduce `src/features/plans/lifecycle/adapters/plan-persistence-store.ts` (or an equivalent adapter-private module) that owns:
   - atomic insert with row locking
   - recent duplicate lookup
   - capped-plan lookup
   - generation status updates
3. Refactor `PlanPersistenceAdapter` to call the private store instead of importing public raw helpers.
4. Move `findCappedPlanWithoutModules` out of `src/features/plans/api/shared.ts`.
5. Relocate `checkPlanLimit` out of `src/features/plans/lifecycle/plan-operations.ts` into a dedicated non-lifecycle quota/query helper, then update `tests/integration/stripe/usage.spec.ts` to import from that new location.
6. Resolve the remaining non-adapter test consumers of the now-privatized helpers; do not leave them importing a deprecated path:
   - `tests/integration/db/usage.spec.ts` imports `atomicCheckAndInsertPlan` from `@/features/plans/lifecycle/plan-operations`.
   - `tests/integration/plans/plan-limit-race-condition.spec.ts` imports `atomicCheckAndInsertPlan` from the same module.
   - Decide per-test whether behavior is now covered by the new `plan-persistence-adapter.spec.ts` (prefer delete/narrow) or whether the integration test should call the `PlanPersistencePort`/adapter surface directly against the real DB. Either way, remove the direct `plan-operations` imports.
7. Tighten helper visibility so non-adapter modules cannot keep importing the old Drizzle helpers as de facto public API.

## Step 1.3 — Migrate session/cleanup consumers to narrow capabilities

1. Introduce:
   - `type PlanGenerationStatusPort = Pick<PlanPersistencePort, 'markGenerationSuccess' | 'markGenerationFailure'>`
2. Update:
   - `src/features/plans/session/stream-cleanup.ts`
   - `src/features/plans/session/stream-outcomes.ts`
   - `src/features/plans/session/plan-generation-session.ts`
   - `src/features/plans/cleanup.ts`
3. Migrate `stream-outcomes.ts` to `UsageRecordingPort` so it stops importing raw `recordUsage`, `canonicalUsageToRecordParams`, and `incrementUsage`.
4. Remove direct imports of `markPlanGenerationFailure` from non-adapter modules.
5. Preserve existing runtime semantics:
   - `safeMarkPlanFailed` still logs and swallows mark-failure errors.
   - `stream-outcomes.ts` still records usage before incrementing aggregates, preserving the current sequencing and error semantics.
   - cleanup still performs consistent stuck-plan transitions with a shared timestamp.
6. If `cleanup.ts` still needs direct transactional selection logic after the helper leakage is removed, document that as intentional issue-307 scope and leave broader cleanup-store extraction for follow-up.

## Step 1.4 — Realign test seams to the new boundary

1. Replace brittle Drizzle-chain mocks where boundary behavior is the real contract:
   - `tests/unit/features/plans/cleanup.spec.ts`
   - `tests/unit/features/plans/lifecycle/plan-operations.spec.ts`
2. Add or reshape focused session helper tests so they assert collaborator behavior, not helper signatures:
   - `tests/unit/features/plans/session/stream-cleanup.spec.ts`
   - `tests/unit/features/plans/session/stream-outcomes.spec.ts`
3. Narrow or delete helper-level tests that only assert query-builder call order once adapter integration coverage owns the persistence contract.
4. Keep service-level tests (`service.spec.ts`, `lifecycle-consolidation.spec.ts`) as the reference pattern for port-boundary testing.

## Validation Steps

1. Pure policy unit tests:
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/policy/duration.spec.ts`
2. Session/cleanup unit tests:
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/cleanup.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/session/stream-cleanup.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/session/stream-outcomes.spec.ts`
3. Lifecycle service/unit regression checks:
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/lifecycle/service.spec.ts`
   - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/plans/lifecycle/lifecycle-consolidation.spec.ts`
4. Persistence adapter integration test:
   - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/features/plans/lifecycle/plan-persistence-adapter.spec.ts`
   - create `tests/integration/features/plans/lifecycle/` first if the subdirectory does not exist
5. Final baseline:
   - `pnpm test:changed`
   - `pnpm check:full`

## Issue Verification & Closure

1. Walk each acceptance criterion in `todos.md` and point to the exact file(s) that satisfy it.
2. Confirm there are no remaining non-adapter imports from:
   - `@/features/plans/lifecycle/plan-operations`
   - `@/features/plans/api/shared`
   where the imported symbol is a lifecycle persistence helper or pure duration policy helper that should now live elsewhere.
3. Confirm that `src/features/plans/session/stream-outcomes.ts` no longer imports:
   - `recordUsage` or `canonicalUsageToRecordParams` from `@/lib/db/usage`
   - `incrementUsage` from `@/features/billing/usage-metrics`
   Usage recording must flow through `UsageRecordingPort` / `UsageRecordingAdapter`.
4. Confirm the public lifecycle service still uses ports only and that adapter integration coverage owns the real DB contract.
5. Only then mark the issue ready to close; no implementation happens as part of this planning task.
