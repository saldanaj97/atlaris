# 006 — Deepen Plans Persistence Ports Over Drizzle Chains

Source: GitHub issue [#307](https://github.com/saldanaj97/atlaris/issues/307).

## Acceptance Criteria

- [ ] Lifecycle-adjacent non-adapter modules stop importing raw persistence helpers from `src/features/plans/lifecycle/plan-operations.ts` or DB-backed plan queries from `src/features/plans/api/shared.ts`; they consume `PlanPersistencePort` or narrower derived capability types instead.
- [ ] Pure duration/tier policy helpers no longer live in DB-heavy modules. `QuotaAdapter` and `creation-pipeline` import DB-free policy helpers from a pure plans policy module.
- [ ] The persistence adapter owns the Drizzle-backed lifecycle queries for atomic insert, duplicate detection, capped-plan lookup, and generation success/failure transitions through an adapter-private store or equivalent private layer.
- [ ] `PlanLifecycleService` and the create/retry/regeneration orchestration remain DTO- and port-oriented; no new `DbClient` or Drizzle query-builder shapes leak into service, origin strategies, session helpers, or tests.
- [ ] Session and cleanup helpers stop depending on raw lifecycle persistence or usage-recording helper functions; they receive narrow `PlanGenerationStatusPort`/`UsageRecordingPort`-level capabilities instead, and any remaining direct `DbClient` usage is documented and intentionally scoped.
- [ ] `src/features/plans/session/stream-outcomes.ts` no longer imports `recordUsage` or `canonicalUsageToRecordParams` from `@/lib/db/usage`, nor `incrementUsage` from `@/features/billing/usage-metrics`; usage recording flows only through `UsageRecordingPort` / `UsageRecordingAdapter`.
- [ ] Test consumers of the privatized persistence helpers are migrated, not left importing a dead path:
  - `tests/unit/plans/duration-caps.spec.ts` targets the new pure policy module or is folded into `tests/unit/features/plans/policy/duration.spec.ts`.
  - `tests/integration/db/usage.spec.ts` and `tests/integration/plans/plan-limit-race-condition.spec.ts` stop importing `atomicCheckAndInsertPlan` from `plan-operations` and assert against the adapter/port surface (or are superseded by the new `plan-persistence-adapter.spec.ts`).
- [ ] Unit tests stop treating Drizzle chain order as the contract for lifecycle/session behavior, and integration coverage is added for the persistence adapter surface against the real integration DB.
- [ ] Validation covers targeted unit/integration commands, then `pnpm test:changed` and `pnpm check:full`.

## Phases

- [ ] Phase 0 — Reconfirm issue scope, acceptance criteria, and out-of-scope boundaries
- [ ] Phase 1 — Extract pure duration policy from mixed DB modules
- [ ] Phase 2 — Deepen the plan persistence adapter/store boundary
- [ ] Phase 3 — Migrate session/cleanup consumers to narrow persistence capabilities
- [ ] Phase 4 — Realign unit and integration coverage to the new boundary
- [ ] Phase 5 — Run validation and walk every acceptance criterion

## Review

### Planning notes

- Planning only. No implementation started.
- `PlanLifecycleService` already depends on `PlanPersistencePort` (`src/features/plans/lifecycle/service.ts`); the plan should preserve that public contract and deepen the adapter/store boundary beneath it.
- `stream-outcomes.ts` usage recording is in scope for this issue because the raw `recordUsage` / `incrementUsage` imports duplicate work already modeled by `UsageRecordingPort` and `UsageRecordingAdapter`.
- `checkPlanLimit` stays out of `PlanPersistencePort`, but it should not remain an accidental export from the lifecycle persistence module. The implementation plan now treats its relocation/update as an explicit task because `tests/integration/stripe/usage.spec.ts` imports it directly today.
- The main open scoping question is how far to push `cleanup.ts`: minimum viable scope is to remove direct helper imports and inject a narrow failure-marking capability; a broader cleanup-store extraction can be treated as follow-up if it expands beyond issue #307.

### Rubber-duck review adjustments

- Added `src/features/plans/session/plan-generation-session.ts` to the planned Slice C wiring work so `safeMarkPlanFailed(...)` call sites do not become compile breaks.
- Locked in `PlanGenerationStatusPort` as a real derived type instead of leaving it as an optional design choice.
- Expanded Slice C scope to include the raw usage-recording imports in `stream-outcomes.ts`.
- Made `checkPlanLimit` disposition explicit instead of letting Slice B accidentally orphan the Stripe usage integration test.

### Recommended execution order

1. Extract the pure duration policy first so the lifecycle and quota layers stop importing policy from DB-heavy modules.
2. Introduce the private persistence store and retarget the adapter without widening the service contract.
3. Migrate session/cleanup consumers to the final narrow capability types.
4. Finish by replacing brittle unit seams and adding real adapter integration coverage.

### Audit addendum (2026-04-20)

Gaps found by post-plan audit and folded into plan/research:

- Slice A was missing `tests/unit/plans/duration-caps.spec.ts` from its import-update list; that spec imports `checkPlanDurationCap` from `plan-operations` today and would break when the pure policy moves. Plan step 1.1 and research Slice A now cover it (retarget or fold into the new pure policy spec).
- Slice B was missing two integration tests that import `atomicCheckAndInsertPlan` from `plan-operations`: `tests/integration/db/usage.spec.ts` and `tests/integration/plans/plan-limit-race-condition.spec.ts`. Plan step 1.2 and research Slice B now require migrating or superseding them via the new adapter spec, rather than letting privatization silently break them.
- Issue verification checklist now also asserts that `stream-outcomes.ts` no longer imports usage helpers from `@/lib/db/usage` or `@/features/billing/usage-metrics` directly, matching Slice C intent.

### Status

Research complete. Audit complete. Ready for implementation planning review only.
