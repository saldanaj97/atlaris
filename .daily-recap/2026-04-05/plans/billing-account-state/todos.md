# Billing Account State Deepening

## Objective

Create a real billing-account boundary so authenticated surfaces, Stripe entry points, and quota-consuming workflows stop manually coordinating subscription state, usage state, and reconciliation rules.

## Planning & Research

- [x] Produce initial current-state research for candidate `#3` ("billing account state") under `.plans/`.
- [x] Confirm this scope refers to shortlist candidate `#3`, not GitHub issue `#3`.
- [x] Map the actual account-state surface.
  - AC: Capture Stripe/account lifecycle entry points.
  - AC: Capture authenticated read consumers.
  - AC: Capture quota-consuming callers outside `src/features/billing/`.
- [x] Document the current ownership fracture lines.
  - AC: Show how `subscriptions.ts`, `stripe-webhook-processor.ts`, `usage-metrics.ts`, and `quota.ts` split one concept.
  - AC: Show where plan/PDF code still depends on billing state without a clean boundary.
  - AC: Show where UI/API consumers assemble their own account snapshots.
- [x] Record the workflows that span too many modules.
  - AC: Checkout flow documented.
  - AC: Portal flow documented.
  - AC: Webhook reconciliation flow documented.
  - AC: Usage reservation/rollback flow documented.
- [x] Resolve the first-slice boundary shape.
  - Decision: **Combined snapshot + Stripe/account transitions.** Snapshot-only leaves transitions fragmented; transition-only leaves consumer drift unfixed. See [plan.md § Scope Decisions](./plan.md).
  - Decision: **Canonical billing-account snapshot is in scope immediately.** It is the primary deliverable of Slice 1A.
- [x] Resolve quota ownership scope.
  - Decision: **Active-plan quota stays in `features/plans`.** `countPlansContributingToCap()` counts plan rows — that is plan-domain logic. Only tier resolution crosses from billing, which is already clean via `QuotaAdapter`.
  - Decision: **Regeneration/PDF quota reservation is OUT for the first pass.** Deferred to Slice 2. Transactional enforcement in `quota.ts` and counter mutations in `usage-metrics.ts` are not broken the same way snapshot assembly and transitions are.
- [x] Convert the research into an implementation-ready plan.
  - AC: Plan has 4 ordered slices (1A–1D) with concrete file clusters. See [plan.md § Implementation Slices](./plan.md).
  - AC: Test fallout matrix identifies keep/refactor/update for each test file. See [plan.md § Slice 1D](./plan.md).
  - AC: All artifacts in `.plans/billing-account-state/`.

## Implementation — Slice 1: Snapshot + Transitions

- [x] **Slice 1A:** Create `account-snapshot.ts` with `BillingAccountSnapshot` type and `getBillingAccountSnapshot()`.
  - AC: Type exported, function owns the canonical billing row read, reuses `getUsageSummary()`, and derives portal eligibility with `canOpenBillingPortalForUser()`.
  - AC: Uses RLS-scoped DB by default.
  - AC: `pnpm type-check` passes in the current repo state.
  - AC: New integration test `account-snapshot.spec.ts` covers free/starter/pro users and portal eligibility edge cases.
- [x] **Slice 1B:** Migrate consumers to canonical snapshot.
  - AC: `BillingCards.tsx` calls `getBillingAccountSnapshot()` instead of 3 separate functions.
  - AC: `GET /api/v1/user/subscription/route.ts` uses snapshot. Response JSON shape unchanged.
  - AC: `PlansContent.tsx` uses snapshot for plan-count badge and list affordances.
  - AC: `pricing/page.tsx` remains on direct portal-eligibility check unless there is a compelling reason to pay for extra usage reads.
  - AC: `create-portal/route.ts`, `user/profile/route.ts`, `user/preferences/route.ts`, and `SiteHeader.tsx` are explicitly left on direct user-row access in Slice 1.
  - AC: Verified with targeted integration checks for `account-snapshot.spec.ts`, `api/user-subscription.spec.ts`, and `stripe/api-routes.spec.ts`.
- [x] **Slice 1C:** Extract named transition functions.
  - AC: `account-transitions.ts` exports `applySubscriptionSync()`, `applySubscriptionDeleted()`, `applyPaymentFailed()`.
  - AC: `stripe-webhook-processor.ts` delegates to named transitions instead of mixed delegation + inline updates.
  - AC: `subscriptions.ts` keeps Stripe-operation helpers in the first pass to avoid churn.
  - AC: `local/complete-checkout/route.ts` is included in transition-path validation.
  - AC: Existing webhook route and subscription integration coverage still passes. `pnpm type-check` passes in the current repo state.
- [x] **Slice 1D:** Migrate and reorganize tests.
  - AC: `account-snapshot.spec.ts` added.
  - AC: `subscriptions.spec.ts` kept intact in the first pass; it still passes after the transition extraction.
  - AC: `stripe-webhook-processor.spec.ts` still passes against the extracted transition helpers without requiring test rewrites.
  - AC: `create-checkout.spec.ts` not rerun yet in this pass because the implementation did not change checkout imports or behavior.
  - AC: `api-routes.spec.ts` verified (subscription API response shape stable).
  - AC: `tests/integration/api/user-subscription.spec.ts` verified (tier/status/cancelAtPeriodEnd/usage shape stable).
  - AC: `usage.spec.ts` unchanged.
  - AC: Targeted integration commands for the changed billing files pass.

## Deferred — Slice 2 (separate planning cycle)

- [ ] Consolidate quota reservation/rollback into billing-account boundary.
  - Scope: `quota.ts` atomic enforcement, `usage-metrics.ts` counter mutations, `QuotaAdapter`, regeneration/PDF routes.
- [ ] Evaluate whether `QuotaAdapter` port should front all quota operations or remain a thin adapter.
- [ ] Evaluate whether active-plan quota cap should move to billing (cross-domain decision).

## Review Notes

- 2026-04-05: Initial research confirms the real problem is missing ownership of billing account state, not merely messy helpers.
- 2026-04-05: Quota ownership is the hardest scope edge. Monthly usage quotas live in billing, but active-plan quota still lives in plans.
- 2026-04-05: Scope frozen. First pass = combined snapshot + transitions. Quota reservation and active-plan cap deferred. Three rejected alternatives documented in plan.md (BillingAccountService class, snapshot-only, transition-only). Portal eligibility rule preserved.
- 2026-04-05: Gap audit tightened the plan. Slice 1 now explicitly excludes row-only consumers, keeps `subscriptions.ts` in place to avoid rename churn, includes `local/complete-checkout/route.ts` in transition validation, and keeps `tests/integration/api/user-subscription.spec.ts` as a contract check.
- 2026-04-05: Slice 1 implementation completed for the intended first pass. Added `account-snapshot.ts`, migrated `BillingCards`, `/api/v1/user/subscription`, and `PlansContent`, extracted `account-transitions.ts` from the webhook processor, and verified targeted billing unit/integration coverage.
- 2026-04-05: Final verification state for this slice: `pnpm exec biome check` passes for the touched billing files, `pnpm type-check` passes in the current repo state, and the targeted billing unit/integration commands listed in `tests/results/unit/2026-04-05-results.md` pass.

## Artifacts

- [research.md](./research.md) — Verified current-state research and planning implications
- [plan.md](./plan.md) — Implementation-ready plan with scope decisions, target interfaces, migration slices, and test fallout
