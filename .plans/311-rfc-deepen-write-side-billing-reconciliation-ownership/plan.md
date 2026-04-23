# Plan: Deepen Write-Side Billing Reconciliation Ownership (issue #311)

Issue: [https://github.com/saldanaj97/atlaris/issues/311](https://github.com/saldanaj97/atlaris/issues/311)

## Acceptance Criteria (author-inferred)

Issue #311 does not contain a formal "Acceptance criteria" block. The criteria tracked in `todos.md` and walked during Step 6.0 are author-inferred from the issue body's goal (one owned write-side reconciliation module contract) and non-expansion constraint (keep read-model snapshot and pricing catalog separate). Closure evidence should describe the inferred criteria as such, not as verbatim issue ACs.

## Summary

Issue 311 is not asking for a second public Stripe boundary. That already exists for checkout, portal, and webhook ingestion under `src/features/billing/stripe-commerce/`. The real problem is deeper: verified webhook application and local replay still cross older seams, so write-side Stripe-to-user-subscription semantics have no single owner.

Today the write path is split across:

- `src/features/billing/stripe-commerce/boundary-impl.ts:209-324` (`acceptWebhook`) for webhook ingestion and preflight; direct `handleStripeWebhookDedupeAndApply` call at `311-317`.
- `src/features/billing/stripe-webhook-processor.ts:102-231` (`applyStripeWebhookEvent`) for event dispatch and `invoice.payment_succeeded` resync, plus `236-290` (`handleStripeWebhookDedupeAndApply`) for idempotency insert + rollback.
- `src/features/billing/account-transitions.ts:75-240` for sync delegation (`applySubscriptionSync` 75-89), subscription deleted (`applySubscriptionDeleted` 92-154), and payment failed (`applyPaymentFailed` 156-240) transitions.
- `src/features/billing/subscriptions.ts:99-212` (`syncSubscriptionToDb`) for Stripe price lookup, tier mapping, and user-row writes during sync; same file also exports `getSubscriptionTier` (70-91), `createCustomer` (219-278), `getCustomerPortalUrl` (287-300), `cancelSubscription` (306-327).
- `src/features/billing/stripe-commerce/local-checkout-replay.ts:16-63` (dedupe/apply call at `56-62`) plus `src/app/api/v1/stripe/local/complete-checkout/route.ts:1-67` (replay wiring `53-64`) for synthetic local subscription creation.

That split is exactly what the issue is calling out. The plan below keeps read-side billing snapshot/catalog work separate and narrows the change to the write-side reconciliation contract.

## Goal

One app-owned write-side collaborator under `src/features/billing/stripe-commerce/` owns Stripe event application semantics:

- verified webhook dedupe + apply + rollback
- subscription-created/updated sync
- subscription-deleted entitlement downgrade/retention
- `invoice.payment_failed` transition handling
- `invoice.payment_succeeded` subscription resync
- local synthetic subscription replay through the same owner

The public `StripeCommerceBoundary` contract stays route-shaped (`beginCheckout`, `openPortal`, `acceptWebhook`) unless implementation evidence forces a minimal addition for local replay.

## Current State (validated against source)

- `DefaultStripeCommerceBoundary.acceptWebhook()` in `src/features/billing/stripe-commerce/boundary-impl.ts:209-324` does payload-size checks, signature verification/dev fallback, livemode guard, and then hands off to `handleStripeWebhookDedupeAndApply(...)` at `311-317`. The boundary owns ingress, not full write semantics.
- `handleStripeWebhookDedupeAndApply()` in `src/features/billing/stripe-webhook-processor.ts:236-290` owns Stripe webhook event insert/duplicate detection and rollback deletion, but it is a free function imported directly by both the boundary and local replay code.
- `applyStripeWebhookEvent()` in `src/features/billing/stripe-webhook-processor.ts:102-231` fans out to `applySubscriptionSync`, `applySubscriptionDeleted`, and `applyPaymentFailed`, and does the `invoice.payment_succeeded` gateway resync itself.
- `account-transitions.ts:75-240` already has explicit injected deps, but it is still an app-facing helper module rather than an internal write-side collaborator owned by the commerce package.
- `syncSubscriptionToDb()` in `src/features/billing/subscriptions.ts:99-212` still mixes Stripe price lookup, tier derivation, subscription-status mapping, and DB writes in a module that also exposes unrelated helpers (`getSubscriptionTier` 70-91, `createCustomer` 219-278, `getCustomerPortalUrl` 287-300, `cancelSubscription` 306-327).
- Consumer audit (verified against current tree):
  - `stripe-webhook-processor.ts` has no `src/` importers outside `stripe-commerce/` (only `boundary-impl.ts`, `local-checkout-replay.ts`, and `tests/unit/stripe/stripe-webhook-processor.spec.ts`). Safe to fully internalize or retire.
  - `account-transitions.ts` is imported only by `stripe-webhook-processor.ts` and `tests/integration/stripe/subscriptions.spec.ts`. Safe to retire after consolidation.
  - `subscriptions.ts` exports: `syncSubscriptionToDb` consumed only by `account-transitions.ts`; `createCustomer` consumed only inside `stripe-commerce/`; `getSubscriptionTier`, `getCustomerPortalUrl`, and `cancelSubscription` have zero `src/` importers (only `tests/integration/stripe/subscriptions.spec.ts`) — likely dead code, decide in Step 1.0.
- Local replay is not boundary-owned yet. `src/features/billing/stripe-commerce/local-checkout-replay.ts:16-63` imports both `createCustomer` and `handleStripeWebhookDedupeAndApply` directly (dedupe/apply call at `56-62`), and `src/app/api/v1/stripe/local/complete-checkout/route.ts:53-64` still assembles gateway/db/users/logger wiring itself.
- Tests are still centered on helper seams that the issue wants to retire or internalize:
  - `tests/unit/stripe/stripe-webhook-processor.spec.ts` (~404 lines)
  - `tests/integration/stripe/subscriptions.spec.ts` (~632 lines)
  - route-level integration in `tests/integration/stripe/api-routes.spec.ts`
  - only light boundary coverage in `tests/integration/stripe/commerce-boundary.spec.ts`

## Proposed Shape

### Decision 1 — Keep ownership inside `src/features/billing/stripe-commerce/`

Do not create a second top-level billing package. The public Stripe commerce boundary is already the right owner. Deepen that package by adding an internal write-side collaborator, for example `src/features/billing/stripe-commerce/reconciliation.ts` or a small `reconciliation/` subpackage.

### Decision 2 — Move write-side orchestration behind one internal contract

Implementation should converge on one internal contract owned by the commerce package. Minimum responsibility:

- `applyVerifiedEvent({ event, gateway, db, logger, users })`
- `replaySyntheticSubscriptionCreated({ user, priceId, gateway, db, logger, users })`

Exact file names are flexible. The contract is not.

### Decision 3 — Make `stripe-webhook-processor.ts` and `account-transitions.ts` internal or retire them

After the refactor, the app should not import write-side Stripe helpers from multiple legacy modules. Either:

1. move their logic into the new internal reconciliation owner, or
2. keep them as private implementation files under `stripe-commerce/` with no app-facing imports outside that package.

`boundary-impl.ts` and local replay code should stop importing a free-standing processor directly.

### Decision 4 — Split unrelated exports out of `subscriptions.ts`

`subscriptions.ts` currently mixes:

- write-side reconciliation behavior (`syncSubscriptionToDb`)
- checkout support (`createCustomer`)
- account actions/read helpers (`getSubscriptionTier`, `getCustomerPortalUrl`, `cancelSubscription`)

The plan should not blindly delete or move public helpers. During implementation, first verify current consumers of `getSubscriptionTier`, `getCustomerPortalUrl`, and `cancelSubscription`. The required change is narrower:

- pull reconciliation-specific logic behind the commerce-owned write-side collaborator
- leave unrelated helpers stable unless a minimal import move is required

### Decision 5 — Route and local replay stay transport glue

- `src/app/api/v1/stripe/webhook/route.ts` should remain HTTP/request-context/rate-limit glue around `boundary.acceptWebhook()`.
- `src/app/api/v1/stripe/local/complete-checkout/route.ts` should remain auth/query validation + redirect glue, but it should stop wiring reconciliation internals itself.

## Likely Files Touched

### Primary implementation slice

- `src/features/billing/stripe-commerce/boundary-impl.ts`
- `src/features/billing/stripe-commerce/factory.ts`
- `src/features/billing/stripe-commerce/local-checkout-replay.ts`
- `src/features/billing/stripe-webhook-processor.ts`
- `src/features/billing/account-transitions.ts`
- `src/features/billing/subscriptions.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`

### Possible new internal files under `src/features/billing/stripe-commerce/`

- `reconciliation.ts` or `reconciliation/index.ts`
- `reconciliation-types.ts` or `reconciliation/types.ts`
- optional narrower helpers for event dispatch or subscription writes if the implementation benefits from one extra split

### Test slice

- `tests/unit/stripe/stripe-webhook-processor.spec.ts`
- `tests/integration/stripe/subscriptions.spec.ts`
- `tests/integration/stripe/api-routes.spec.ts`
- `tests/integration/stripe/commerce-boundary.spec.ts`
- optional new unit/integration specs under `tests/unit/features/billing/stripe-commerce/` or `tests/integration/stripe/`

## Non-Goals

- No billing read-model work (`src/features/billing/account-snapshot.ts`, `src/app/api/v1/user/subscription/route.ts`, pricing snapshot consumers).
- No pricing catalog / checkout catalog redesign.
- No auth/request-boundary refactor.
- No schema migration.
- No webhook route HTTP behavior changes.
- No broad Stripe client rewrite outside what the reconciliation owner needs.
- No quota/regeneration work.

## Step 0.0 — Confirm Scope

1. Re-run `gh issue view 311 --json number,title,body,labels,state,url`.
2. Confirm no `.plans/311-*` folder existed before this package.
3. Confirm issue scope stays write-side only:
  - keep read-side snapshot/caching/catalog concerns out
  - keep checkout/portal public contract unchanged unless implementation evidence forces a minimal additive change

## Step 1.0 — Freeze the Write-Side Contract

Settle one internal write-side owner inside `stripe-commerce/`. Before editing behavior, define:

- who may call it:
  - `DefaultStripeCommerceBoundary.acceptWebhook()`
  - local checkout replay flow
- what it owns:
  - webhook dedupe insert/delete rollback
  - event-type dispatch
  - subscription sync/delete/payment-failed semantics
  - `invoice.payment_succeeded` resync
  - local synthetic subscription-created replay
- what stays outside:
  - request parsing/signature/body-size/livemode HTTP preflight
  - redirect transport behavior
  - unrelated billing reads and account actions

Implementation guardrail: no new public top-level entrypoints unless the local replay flow cannot be cleanly routed through an existing boundary-owned seam.

## Step 1.5 — Write Owner-Seam Tests First (TDD Red)

Before moving behavior, write failing tests that describe the new write-side owner's contract. These must compile against the not-yet-implemented owner module and fail for the right reason (missing implementation), not for shape mismatch.

Required red-phase coverage (will turn green through Step 2.0 and 3.0):

- verified-event application: subscription created, updated, deleted, payment failed, `invoice.payment_succeeded` resync
- idempotency: duplicate event id returns duplicate signal without re-applying
- rollback: application failure deletes the inserted idempotency row so retry is safe
- local synthetic subscription-created replay uses the same owner path as live webhook
- price lookup failure throws (webhook retry preserved)
- missing mapped user on sync logs and resolves (no throw)
- retained-entitlement delete clears `stripeSubscriptionId` without downgrading to free

If a helper-seam test already asserts one of the above, move/rewrite it against the owner rather than duplicate it. This step is the retirement signal for helper tests listed under Step 4.0.

Rationale: AGENTS.md prefers TDD for new features and bug fixes. The write-side owner is new code; its contract deserves red-green-refactor. Step 4.0 now becomes the cleanup sweep after the owner is green.

## Step 2.0 — Pull Webhook and Local Replay Behind the Same Owner

1. Rewrite `boundary-impl.ts` so `acceptWebhook()` stops calling `handleStripeWebhookDedupeAndApply(...)` directly and instead delegates to the new write-side owner.
2. Rewrite `local-checkout-replay.ts` so it stops importing `handleStripeWebhookDedupeAndApply` and `createCustomer` as free-standing orchestration pieces. The replay helper should call the same write-side owner that live webhook processing uses.
3. Rewrite `src/app/api/v1/stripe/local/complete-checkout/route.ts` so the route stops composing gateway/db/users/logger details for reconciliation.
4. Preserve current observable behavior:
  - duplicate webhooks return `200 ok` with `duplicate: true`
  - local completion still redirects to `next`
  - synthetic local replay still goes through the same dedupe/application path as live webhook semantics

## Step 3.0 — Consolidate Subscription Mutation Semantics

This is the part that will fail if the implementation gets lazy.

1. Pull `syncSubscriptionToDb()` write semantics behind the new owner or a private collaborator it owns.
2. Pull `applySubscriptionDeleted()` and `applyPaymentFailed()` behind that same ownership boundary.
3. Preserve current semantics explicitly:
  - price/product lookup drives tier mapping during sync
  - missing user mapping on sync logs and resolves, not throws
  - price lookup failure still throws so webhook retry remains possible
  - `cancel_at_period_end` + future period-end on delete retains entitlements and clears `stripeSubscriptionId`
  - `invoice.payment_failed` only downgrades eligible mapped users
  - `invoice.payment_succeeded` still rehydrates the subscription through the gateway before syncing
4. After logic moves, verify whether `account-transitions.ts` and `stripe-webhook-processor.ts` still deserve to exist. If they only forward to the new owner, retire them or make them private to the package.

## Step 4.0 — Re-center Tests on Boundary Behavior

Step 1.5 already seeded the owner-seam tests (red → green across Steps 2.0 and 3.0). This step is the cleanup sweep: ensure full owner coverage and retire helper-first tests that only duplicate owner behavior.

### Fill any gaps in owner-seam coverage not already seeded in Step 1.5

- verified webhook duplicate handling
- rollback delete on processing failure
- `customer.subscription.created` / `updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded` resync
- missing subscription id / missing gateway failure path
- local synthetic subscription replay
- retained-entitlement delete case
- price lookup failure retry path

### Slim or retire helper-first coverage

- `tests/unit/stripe/stripe-webhook-processor.spec.ts` should either move under the new owner or be replaced with tests against that owner
- `tests/integration/stripe/subscriptions.spec.ts` should stop treating extracted helpers as the primary contract for write-side Stripe behavior
- `tests/integration/stripe/api-routes.spec.ts` should stay focused on HTTP/request behavior
- `tests/integration/stripe/commerce-boundary.spec.ts` should gain the write-side assertions that actually matter after the refactor

Net rule: tests should prove the owner described in the issue, not the accidental helper graph being removed.

## Step 5.0 — Validation

Run focused billing Stripe tests first, then repo baselines:

- targeted Vitest files for the touched Stripe/billing slice
- `pnpm test:changed`
- `pnpm check:full`

If `pnpm test:changed` fails because Testcontainers runtime is unavailable, record that as an environment blocker rather than pretending the slice regressed.

## Step 6.0 — Issue Verification & Closure

Before closing the issue, walk each author-inferred acceptance criterion (see "Acceptance Criteria (author-inferred)" above) with concrete evidence. Closure comment on issue #311 should state the criteria were inferred from the issue body, not quoted from a formal AC block:

1. One write-side owner exists under `src/features/billing/stripe-commerce/`.
2. `boundary-impl.ts` no longer imports a free-standing webhook processor.
3. Local replay no longer assembles reconciliation internals itself.
4. Write-side subscription mutation semantics are covered at the owner seam, not only at helper seams.
5. Read-side billing snapshot/catalog code stayed untouched unless explicitly justified.
6. `pnpm test:changed` and `pnpm check:full` results recorded.

## Risks

- `subscriptions.ts` still contains unrelated exports. Sloppy extraction can create churn or accidental contract changes.
- Local replay currently provisions Stripe customers through `serviceRoleDb`, while live checkout uses the request-scoped DB path. The refactor must choose deliberately whether to preserve or align that behavior.
- `invoice.payment_succeeded` resync currently has sharp error behavior around missing gateway/subscription id. That behavior must stay explicit.
- Helper-heavy tests may give false confidence if they are moved mechanically without re-centering assertions on the new owner.

## Open Questions

1. ~~Does local replay need a new internal commerce-boundary method, or can it cleanly route through the new write-side collaborator without changing the public interface?~~ **Resolved:** default to routing `local-checkout-replay.ts` directly through the new internal write-side owner since it already lives inside `stripe-commerce/`. Keep the public `StripeCommerceBoundary` contract unchanged. Only add a public seam if implementation evidence forces it (e.g., if local replay must be callable from code outside the commerce package).
2. After consumer verification, should `syncSubscriptionToDb` disappear as a public export entirely? Consumer audit shows only `account-transitions.ts` imports it, so once `account-transitions` logic is consolidated into the new owner, `syncSubscriptionToDb` has no public consumers and should become a private collaborator of the owner.
3. Consumer audit shows `account-transitions.ts` is imported only by `stripe-webhook-processor.ts` and one integration test, so after consolidation the file can retire completely.
4. `subscriptions.ts` exports `getSubscriptionTier`, `getCustomerPortalUrl`, and `cancelSubscription` that have zero `src/` importers (only a single integration test). Decision in Step 1.0: delete as dead code in this slice (in-scope cleanup of the write-side module), or explicitly defer with a dated follow-up. Do not silently leave them.

## Recommended Direction

Do the minimal but real version:

- deepen `src/features/billing/stripe-commerce/`
- give write-side reconciliation one owner
- move tests to that seam
- leave read-side billing and unrelated account actions alone

Anything broader is comfort work. Anything narrower misses the issue.