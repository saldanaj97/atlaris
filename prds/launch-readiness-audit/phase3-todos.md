# Phase 3: Post-Launch Cleanup — Execution Tracker

> **Parent PRD:** [#284](https://github.com/saldanaj97/atlaris/issues/284)
> **Prerequisite:** Phase 1 + Phase 2 merged ✅
> **Status:** ✅ Implemented and validated; remaining RLS hardening follow-up tracked in [#297](https://github.com/saldanaj97/atlaris/issues/297)

## Execution Order

```
#293 Read-Path Optimization & Subscription Caching    ✅ Complete
#294 Persistence Simplification & Queue Consolidation ✅ Complete
```

---

## Slice 9: Read-Path Optimization & Subscription Caching (#293)

### Implementation Steps

- [x] 9.1 Create `src/shared/constants/pagination.ts` with `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`
- [x] 9.2 Write tests for plan-list pagination defaults and boundary behavior
- [x] 9.3 Add `getLightweightPlanSummaries()` and `getPlanSummaryCount()` in `src/lib/db/queries/plans.ts` — select only list-view columns, exclude `extractedContext`
- [x] 9.4 Add `LightweightPlanSummary` type to `src/shared/types/db.types.ts`
- [x] 9.5 Update `GET /api/v1/plans` route to parse `limit`/`offset` query params, call lightweight query, add `X-Total-Count` header
- [x] 9.6 Write tests for subscription caching — `cancelAtPeriodEnd` from DB, no live Stripe call
- [x] 9.7 Add `cancelAtPeriodEnd` boolean column to users table schema + generate migration
- [x] 9.8 Update `syncSubscriptionToDb()` in `src/features/billing/subscriptions.ts` to sync `cancel_at_period_end`
- [x] 9.9 Remove `getCancelAtPeriodEnd()` live Stripe call from subscription route; read from `user.cancelAtPeriodEnd`
- [x] 9.10 Validate: lint, type-check, test:changed

### Acceptance Criteria

- [x] Plan-list endpoints return paginated results by default
- [x] Lightweight plan summaries are used for list views (not full plan objects)
- [x] Subscription status is served from webhook-synced local state
- [x] Live provider reads are only used for repair/admin/fallback, not default reads
- [x] Tests cover pagination defaults, summary contracts, and billing-status fallback behavior

### Review Follow-Up Notes

- Review-driven cleanup/refactor work for Slice 9 landed on this branch and was
  included in the green validation pass.

---

## Slice 10: Persistence Simplification & Queue Consolidation (#294)

### Implementation Steps

- [ ] 10.1 Complete the broader RLS/state-ownership hardening pass so every
      `learning_plans.generationStatus` mutation can be proven to flow through the
      intended boundary ([#297](https://github.com/saldanaj97/atlaris/issues/297))
- [x] 10.2 Remove duplicate `learning_plans` UPDATE from `persistSuccessfulAttempt` in `attempts-persistence.ts:227-236` — lifecycle service already calls `markPlanGenerationSuccess`
- [ ] 10.3 Move the remaining `reserveAttemptSlot()`/attempt-finalization state
      ownership fully behind the lifecycle boundary once the current `lib/` →
      `features/` dependency constraint is resolved ([#297](https://github.com/saldanaj97/atlaris/issues/297))
- [x] 10.4 Update cleanup module (`cleanup.ts`) to delegate plan state mutations to plan-operations instead of direct SQL
- [x] 10.5 Verify `planGenerations` table is unused by application code (schema/relations only), then remove table + type + relations + generate migration
- [x] 10.6 Add JSDoc to `queue.ts` explaining thin-wrapper pattern; document `PLAN_GENERATION` job type as reserved/unused
- [x] 10.7 Create `docs/technical-debt.md` documenting all deferred debt with rationale
- [x] 10.8 Validate: lint, type-check, test:changed

### Notes

- Slice 10 intentionally stopped short of moving every single
  `learning_plans.generation_status` mutation into `plan-operations.ts` because
  `reserveAttemptSlot()` still lives under `lib/`, and `lib/` must not import
  from `features/`.
- Broader RLS hardening was intentionally deferred from this branch and tracked
  separately in [#297](https://github.com/saldanaj97/atlaris/issues/297).
- `drizzle-kit generate` is currently blocked by pre-existing corruption in
  `src/lib/db/migrations/meta`, so the Phase 3 schema change was added as a
  manual SQL migration with a matching `_journal.json` entry.

### Acceptance Criteria

- [x] Generation/attempt persistence is simplified (fewer tables or cleaner state machine)
- [x] Background job paths are consolidated where possible
- [x] Remaining technical debt is explicitly documented as deferred with rationale
- [x] No regression in generation correctness or lifecycle behavior
- [x] Tests cover any persistence changes and verify no behavioral regressions

### Review Follow-Up Notes

- Review follow-up/refactor work for Slice 10 is complete and was included in
  the green validation run on this branch.
- The only intentionally deferred part is the broader RLS/state-ownership
  cleanup captured in [#297](https://github.com/saldanaj97/atlaris/issues/297);
  Phase 3 itself is otherwise complete.
