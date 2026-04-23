# 311 — RFC: deepen write-side billing reconciliation ownership

Issue: [https://github.com/saldanaj97/atlaris/issues/311](https://github.com/saldanaj97/atlaris/issues/311)
Plan: `./plan.md`

## Acceptance Criteria (author-inferred)

Issue #311 does not contain a formal "Acceptance criteria" block. The criteria below are inferred from the issue's stated goal (single app-owned write-side module contract) and non-expansion constraint (keep read-model snapshot and pricing catalog separate). Closure evidence on issue #311 should describe them as author-inferred, not verbatim issue ACs.

- One write-side owner exists under `src/features/billing/stripe-commerce/` for verified webhook application and local synthetic replay.
- `src/features/billing/stripe-commerce/boundary-impl.ts` no longer imports a free-standing webhook processor directly.
- Local checkout replay no longer assembles reconciliation internals itself from multiple legacy helpers/modules.
- Subscription sync, delete, payment-failed, and `invoice.payment_succeeded` resync semantics remain behaviorally unchanged.
- Write-side tests move to the owner seam; route tests stay HTTP-focused.
- Billing read-model/catalog consumers stay out of scope unless implementation evidence proves a required touch.
- `pnpm test:changed` and `pnpm check:full` pass.

## Tasks (aligned with plan.md Steps)

### Step 0.0 — Confirm Scope

- Load live issue `#311` and confirm the issue body still scopes this to write-side billing reconciliation ownership.
- Confirm no pre-existing `.plans/311-*` folder was already carrying this work.
- Confirm the current code split across `boundary-impl.ts`, `stripe-webhook-processor.ts`, `account-transitions.ts`, `subscriptions.ts`, and local replay before drafting implementation steps.

### Step 1.0 — Freeze the Write-Side Contract

- Choose the internal owner location under `src/features/billing/stripe-commerce/` and document the exact module contract before moving behavior.
- Verify all external consumers of `syncSubscriptionToDb`, `account-transitions.ts`, and unrelated `subscriptions.ts` exports before shrinking export scope. Findings:
  - `stripe-webhook-processor.ts`: no `src/` importers outside `stripe-commerce/` → safe to internalize or retire.
  - `account-transitions.ts`: imported only by `stripe-webhook-processor.ts` and one integration test → safe to retire after consolidation.
  - `syncSubscriptionToDb`: imported only by `account-transitions.ts` → becomes private collaborator of new owner.
  - `createCustomer`: imported only inside `stripe-commerce/` → safe to move behind the owner.
  - `getSubscriptionTier`, `getCustomerPortalUrl`, `cancelSubscription`: zero `src/` importers, only `tests/integration/stripe/subscriptions.spec.ts` → likely dead code.
- Decide dead-export fate for `getSubscriptionTier`, `getCustomerPortalUrl`, `cancelSubscription`: **deleted** from `subscriptions.ts` (no `src/` consumers); removed corresponding integration tests in `subscriptions.spec.ts`.
- Resolve open question #1: default to routing local replay through the new internal owner directly (since `local-checkout-replay.ts` lives inside `stripe-commerce/`), keeping the public `StripeCommerceBoundary` contract unchanged. Only add a public seam if implementation evidence forces it.
- Keep `StripeCommerceBoundary` public entrypoints unchanged unless local replay cannot be routed cleanly without a minimal additive seam.

### Step 1.5 — Write Owner-Seam Tests First (TDD Red)

- Owner-seam unit tests: `tests/unit/features/billing/stripe-commerce/reconciliation.spec.ts` (`applyVerifiedEvent` — dedupe, rollback, `invoice.payment_succeeded` resync).
- Red-phase coverage (now green): idempotency + rollback + payment_succeeded in unit spec; subscription sync/delete/payment_failed + price throw + missing user + retained delete remain in `tests/integration/stripe/subscriptions.spec.ts` (imports `reconciliation` instead of `account-transitions`).
- Local replay same path: `replaySyntheticSubscriptionCreated` → `applyVerifiedEvent` in `reconciliation.ts`; `local-checkout-replay.ts` re-exports as `replayLocalSubscriptionCreated`.

### Step 2.0 — Pull Webhook and Local Replay Behind the Same Owner

- `acceptWebhook` → `applyVerifiedEvent`.
- `local-checkout-replay.ts` → re-export from `reconciliation.ts` only.
- **Done:** `executeLocalSubscriptionReplay()` in `stripe-commerce/factory.ts` composes gateway + service-role DB + `users` + logger; `complete-checkout/route.ts` calls it (transport-only).
- Duplicate + redirect semantics preserved.

### Step 3.0 — Consolidate Subscription Mutation Semantics

- `subscription-db-sync.ts` holds `syncSubscriptionToDb`; reconciliation owns dispatch + transitions.
- Delete/payment-failed in `reconciliation.ts`.
- Edge cases preserved (integration spec green).
- Removed `stripe-webhook-processor.ts` and `account-transitions.ts`.

### Step 4.0 — Re-center Tests on Boundary Behavior

- Replaced `tests/unit/stripe/stripe-webhook-processor.spec.ts` with `tests/unit/features/billing/stripe-commerce/reconciliation.spec.ts`.
- **Done:** `commerce-boundary.spec.ts` — `acceptWebhook` duplicate + livemode mismatch (no `stripeWebhookEvents` row). Unit tests — `invoice.payment_succeeded` missing subscription id, missing gateway, `retrieveSubscription` failure logging + rollback.
- **Done:** `api-routes.spec.ts` — local complete-checkout 401 / 404 / 400.
- Further slim `subscriptions.spec.ts` toward owner-only API (still imports transition fns for DB-heavy cases).

### Step 5.0 — Validation

- Targeted: `reconciliation.spec.ts`, `subscriptions.spec.ts` integration; `pnpm test:changed` passed.
- `pnpm check:type` passed.
- `pnpm check:full` passed locally.

### Step 6.0 — Issue Verification & Closure

- Evidence table + security checklist updated below.
- Issue #311 — closure comment posted + issue closed (`state_reason: completed`).

## Review

### Deviations / notes

- Used repo-standard `plan.md` instead of `plans.md`. This repo has an established `.plans/*/plan.md` convention already; creating a second filename convention here would be noise.

### Risks (carried from `plan.md`)

Track these during implementation; each should have explicit evidence in the Review section at closure.

- `subscriptions.ts` now only exports `createCustomer` (dead helpers removed).
- Local replay: **preserved** serviceRoleDb for `createCustomer` + webhook apply; documented in `reconciliation.ts` module comment.
- `invoice.payment_succeeded` resync has sharp error behavior around missing gateway / missing subscription id. Preserve the explicit throw/log behavior at the owner seam; do not soften by accident.
- Helper-heavy tests can give false confidence if moved mechanically. Every moved test must re-center its assertions on the owner seam, not the retired helper graph.
- Step 1.5 owner-seam red tests must fail for missing implementation, not for shape mismatch, or TDD loop is only cosmetic.

### Evidence table (Step 6.0)


| Acceptance Criterion                                                      | Evidence                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| One write-side owner exists under `src/features/billing/stripe-commerce/` | `reconciliation.ts`, `subscription-db-sync.ts`                                               |
| `boundary-impl.ts` no longer imports a free-standing webhook processor    | imports `applyVerifiedEvent` from `./reconciliation`                                         |
| Local replay no longer assembles reconciliation internals itself          | `executeLocalSubscriptionReplay()` in `factory.ts`; route calls it only                      |
| Subscription sync/delete/payment-failed/resync semantics preserved        | `pnpm test:changed` + targeted integration                                                   |
| Tests moved to the owner seam                                             | `reconciliation.spec.ts` + `commerce-boundary.spec.ts` write-side + `api-routes` local route |
| Read-side billing snapshot/catalog remained out of scope                  | no snapshot/catalog edits                                                                    |
| Validation completed                                                      | `pnpm test:changed` OK; `pnpm check:full` OK                                                 |


### Security Review Checklist (plan.md)

- Service-role DB usage stays deliberate and documented at the new owner seam.
- Webhook idempotency insert/delete rollback behavior is still covered by tests.
- Missing-user / missing-subscription-id / missing-gateway cases still log and fail with the intended severity (missing-user: `subscriptions.spec.ts` + sync path; missing sub id / gateway / retrieve: `reconciliation.spec.ts`).
- No new route-level auth bypass or request-context leakage is introduced (`api-routes.spec.ts` local complete-checkout 401 / gated 404 / validation 400).
- Read-side billing data access stayed out of the write-side refactor.

### Validation excerpts

- `2026-04-23`: `pnpm exec tsx scripts/tests/run.ts unit tests/unit/features/billing/stripe-commerce/reconciliation.spec.ts` — pass.
- `2026-04-23`: `pnpm exec tsx scripts/tests/run.ts integration tests/integration/stripe/subscriptions.spec.ts` — pass.
- `2026-04-23`: `pnpm test:changed` — pass.
- `2026-04-23`: `pnpm check:type` — pass.
- `2026-04-23`: `pnpm check:full` — pass.
- `2026-04-23` (close-out slice): `pnpm test:changed` + `pnpm check:full` after factory local replay + tests — pass.

### Follow-ups

- Resolve the local replay ownership question before implementation starts. (Resolved: route through internal owner; keep public boundary unchanged.)
- Resolve whether `syncSubscriptionToDb` remains as any public export after consumer verification. (Resolved: becomes private collaborator of owner; no `src/` consumers remain after `account-transitions.ts` retires.)
- Decide fate of `getSubscriptionTier`, `getCustomerPortalUrl`, `cancelSubscription` — **deleted** in-slice.