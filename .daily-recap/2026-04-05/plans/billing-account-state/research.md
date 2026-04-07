# Research: Billing Account State

> **Research date:** 2026-04-05
> **Status:** Initial research complete - ready for planning decisions
> **Scope note:** This document covers candidate `#3` from the architecture shortlist ("billing account state"), not GitHub issue `#3`.

## Current-State Summary

The repo does not have a real billing-account boundary yet. It has a set of Stripe-facing helpers, usage/quota helpers, plan-side adapters, and UI/API consumers that all touch the same business state from different directions.

That state currently lives across four places:

1. `users` row subscription fields
   - `subscriptionTier`
   - `subscriptionStatus`
   - `subscriptionPeriodEnd`
   - `cancelAtPeriodEnd`
   - `stripeCustomerId`
   - `stripeSubscriptionId`
2. `usage_metrics` monthly counters
3. `learning_plans` quota-eligible rows that determine active-plan limits
4. Stripe as the external source for checkout, portal, and subscription lifecycle events

No single module owns reconciliation across those four sources.

## Verified Entry Points

### Stripe and account lifecycle entry points

- `src/app/api/v1/stripe/create-checkout/route.ts`
- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/app/api/v1/stripe/webhook/route.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`

### Authenticated billing/read consumers

- `src/app/settings/billing/components/BillingCards.tsx`
- `src/app/pricing/page.tsx`
- `src/app/api/v1/user/subscription/route.ts`
- `src/components/billing/ManageSubscriptionButton.tsx`
- `src/app/plans/components/PlansContent.tsx`

### Quota-consuming callers outside the billing folder

- `src/app/api/v1/plans/[planId]/regenerate/route.ts`
- `src/features/plans/api/pdf-origin.ts`
- `src/features/plans/lifecycle/adapters/quota-adapter.ts`
- `src/app/api/v1/plans/from-pdf/extract/route.ts`
- `src/features/plans/lifecycle/plan-operations.ts`

## Current Ownership Map

### `src/features/billing/subscriptions.ts`

Owns three different concerns that do not form a coherent boundary:

- snapshot read: `getSubscriptionTier()`
- external transition prep: `createCustomer()`, `getCustomerPortalUrl()`
- external-to-local reconciliation: `syncSubscriptionToDb()`

The problem is not file size. The problem is that callers still need to know which of those functions operate on local truth, which touch Stripe, and which mutate account state.

### `src/features/billing/stripe-webhook-processor.ts`

Owns webhook dedupe and event application, but not the subscription state machine as a first-class module.

- `handleStripeWebhookDedupeAndApply()` owns idempotency insert + rollback
- `applyStripeWebhookEvent()` partially owns lifecycle transitions
- `syncSubscriptionToDb()` in `subscriptions.ts` owns the heavy lifting for `customer.subscription.*` and `invoice.payment_succeeded`
- `customer.subscription.deleted` and `invoice.payment_failed` update the `users` row inline inside the processor instead of through the same sync path

That means webhook behavior is split between the processor and the subscriptions helper instead of being owned by one transition boundary.

### `src/features/billing/usage-metrics.ts` and `src/features/billing/quota.ts`

These two files jointly represent quota and usage state:

- `usage-metrics.ts` owns CRUD-ish counter updates and the `getUsageSummary()` read model
- `quota.ts` owns transactional limit enforcement for regenerations and PDF plans
- plan-count quota remains in `src/features/plans/lifecycle/plan-operations.ts`, which pulls `resolveUserTier()`, `selectUserSubscriptionTierForUpdate()`, and `TIER_LIMITS` from billing

So even quota ownership is split:

- billing owns monthly usage quotas
- plans owns active-plan quota
- PDF flows and regeneration flows call different helper combinations

### Consumer composition layers

The same account state is reassembled separately by different consumers:

- `BillingCards.tsx` fetches `getUsageSummary()` + `getSubscriptionTier()` and computes display percentages locally
- `pricing/page.tsx` uses `withServerComponentContext()` + `canOpenBillingPortalForUser()` but does not share a snapshot boundary with settings
- `GET /api/v1/user/subscription` returns yet another ad hoc subscription-plus-usage shape
- `PlansContent.tsx` and `PlanCountBadgeContent()` read billing usage again just to render plan-count affordances

That is not one account read model. It is multiple caller-owned assembly steps.

## Verified Friction

### 1. There is no canonical "billing account snapshot"

Three different authenticated surfaces need roughly the same answer:

- what tier is this user on?
- can they open the portal?
- what usage limits apply?
- what usage has been consumed?
- what lifecycle state should be shown?

But they get it from different combinations:

- `BillingCards.tsx` combines `getUsageSummary()` with `getSubscriptionTier()`
- `pricing/page.tsx` trusts the auth-loaded user row plus `canOpenBillingPortalForUser()`
- `GET /api/v1/user/subscription` returns `user` fields plus `getUsageSummary()`
- `PlansContent.tsx` reads usage without any billing snapshot abstraction

This guarantees drift in consumer semantics.

### 2. The checkout -> webhook -> read path is split across too many modules

The actual workflow is:

1. `ManageSubscriptionButton` or pricing UI initiates a billing action
2. `create-checkout` validates price IDs and redirect URLs
3. `createCustomer()` pre-provisions a Stripe customer and stores `stripeCustomerId`
4. Stripe later emits subscription events
5. `webhook/route.ts` verifies and dedupes the event
6. `stripe-webhook-processor.ts` decides which branch applies
7. `syncSubscriptionToDb()` or inline update logic mutates the `users` row
8. settings/pricing/subscription API re-read local state

That is one business workflow, but no single module owns it end-to-end.

### 3. Quota enforcement is part of billing account state, but the repo treats it as separate plumbing

Examples:

- regeneration route reserves monthly usage through `atomicCheckAndIncrementUsage()`, then manually rolls back with `decrementRegenerationUsage()` if enqueue deduplicates
- PDF origin preparation reserves quota through `atomicCheckAndIncrementPdfUsage()` and rolls back through `decrementPdfPlanUsage()`
- `QuotaAdapter` wraps those same PDF functions again for the plan lifecycle service
- active-plan quota is not in billing/quota at all; it still lives in `plan-operations.ts`
- PDF extraction size limits read tier through `resolveUserTier()` directly

This means "what account limits apply, and how do we reserve/reconcile them?" is spread across billing, plans, and PDF code.

### 4. DB authority is inconsistent

The codebase uses different DB authority modes for the same account concept:

- `getSubscriptionTier()` and `getUsageSummary()` default to runtime `getDb()`
- `createCustomer()` and `syncSubscriptionToDb()` use service-role `db`
- webhook route injects `db` and `users`
- plan routes pass runtime `db` into quota functions

Those choices may each be justified, but there is no module making the rules obvious. Callers just know them by precedent.

### 5. Tests reveal shallow seams instead of business boundaries

The current tests are heavily centered on helper-level seams:

- `tests/integration/stripe/subscriptions.spec.ts` tests `createCustomer()`, `getSubscriptionTier()`, `syncSubscriptionToDb()`, and `getCustomerPortalUrl()` independently
- `tests/unit/stripe/stripe-webhook-processor.spec.ts` focuses on injected DB usage and rollback behavior
- `tests/integration/stripe/create-checkout.spec.ts` validates route -> helper choreography
- `tests/integration/api/user-subscription.spec.ts` validates a separate snapshot shape
- `tests/integration/stripe/usage.spec.ts` treats plan limit and usage counters as adjacent but separate concerns

That is what happens when the real account boundary is missing: the suite protects internal handoff points instead of one business interface.

## Workflows That Span Too Many Modules

### Workflow A: Start checkout

- UI: pricing/settings call `ManageSubscriptionButton`
- API: `create-checkout/route.ts`
- Local side effect: `createCustomer()`
- External side effect: Stripe checkout session creation
- Follow-up state convergence: webhook path only

The route owns too much orchestration for a workflow that is conceptually "begin paid subscription flow for this account."

### Workflow B: Open billing portal

- UI: `ManageSubscriptionButton`
- Eligibility: `canOpenBillingPortalForUser()`
- API: `create-portal/route.ts`
- External side effect: `getCustomerPortalUrl()`

This is smaller than checkout, but still reconstructs account-read rules at the caller layer.

### Workflow C: Apply verified Stripe event

- API: `webhook/route.ts`
- Dedupe: `handleStripeWebhookDedupeAndApply()`
- Transition logic: `applyStripeWebhookEvent()`
- State sync: `syncSubscriptionToDb()` or inline row updates

That is one external-to-local reconciliation workflow currently owned by at least two modules.

### Workflow D: Reserve and reconcile usage quota

- regeneration route: reserve in billing, enqueue in jobs, rollback in billing
- PDF plan origin: reserve in billing, verify provenance in plans/pdf, rollback in billing
- lifecycle `QuotaAdapter`: wraps some of the same billing functions for service use

The reserve/reconcile logic is structurally similar, but the repo repeats it by caller and feature.

## Scope Boundaries That Matter

### In scope for planning

- subscription/account snapshot reads for authenticated surfaces
- checkout and portal initiation workflows
- webhook-driven subscription reconciliation
- quota reservation/reconciliation that clearly belongs to billing account state
- overlaps with plans/PDF only where they expose the missing billing-account boundary

### Likely out of scope for the first slice

- redesigning all pricing-page presentation code
- refactoring Stripe env/catalog setup unless it blocks the account boundary
- rewriting plan lifecycle ownership wholesale
- changing the underlying quota policy values in `TIER_LIMITS`

## Planning Implications

### 1. The next plan should not be framed as "clean up billing helpers"

That would preserve the same caller-owned choreography. The real problem is missing ownership of billing account state and transitions.

### 2. The first major decision is boundary shape

You need to decide whether the first deep module owns:

- only an account snapshot/read boundary
- a Stripe/account transition boundary
- or both reads and transitions behind one `BillingAccountService`

If that is not decided up front, the plan will turn into file-moving theater.

### 3. Plan quota ownership is the hardest scope edge

The active-plan cap currently lives in `features/plans`, while monthly usage quotas live in `features/billing`.

That means the planning decision is not trivial:

- either billing-account-state first slice includes only monthly/account usage concerns
- or it also absorbs plan-cap semantics and becomes the true quota authority

The code cannot answer that. Product and architecture intent have to.

### 4. The first slice should probably establish one canonical account snapshot

Today the same state is assembled separately for:

- settings billing
- pricing
- user subscription API
- plans count/usage affordances

Without a canonical snapshot, every later transition refactor will still leak semantics into callers.

## Initial Slice Candidates

These are planning candidates, not yet the final implementation plan.

### Slice A: Billing account snapshot

Own one canonical read boundary for authenticated billing/account state:

- tier
- subscription lifecycle fields
- portal eligibility
- usage limits and consumption

Likely files:

- `src/features/billing/subscriptions.ts`
- `src/features/billing/usage-metrics.ts`
- `src/features/billing/portal-eligibility.ts`
- `src/app/settings/billing/components/BillingCards.tsx`
- `src/app/pricing/page.tsx`
- `src/app/api/v1/user/subscription/route.ts`
- `src/app/plans/components/PlansContent.tsx`

### Slice B: Stripe account transitions

Own the workflows that mutate local account state because of Stripe:

- pre-provision customer
- open portal
- apply verified webhook event
- local checkout completion in testing mode

Likely files:

- `src/features/billing/subscriptions.ts`
- `src/features/billing/stripe-webhook-processor.ts`
- `src/app/api/v1/stripe/create-checkout/route.ts`
- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/app/api/v1/stripe/webhook/route.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`

### Slice C: Quota reservations and reconciliation

Decide whether billing account state should also own:

- regeneration quota reservation/rollback
- PDF quota reservation/rollback
- active-plan cap ownership

Likely files:

- `src/features/billing/quota.ts`
- `src/features/billing/usage-metrics.ts`
- `src/app/api/v1/plans/[planId]/regenerate/route.ts`
- `src/features/plans/api/pdf-origin.ts`
- `src/features/plans/lifecycle/adapters/quota-adapter.ts`
- `src/features/plans/lifecycle/plan-operations.ts`

## Open Questions For Planning

These are the questions the codebase cannot answer cleanly on its own:

1. Is the first target a read boundary, a transition boundary, or a combined billing-account service?
2. Does candidate `#3` include active-plan quota ownership, or do we explicitly leave that in plans for the first pass?
3. Do pricing, settings, plans affordances, and `GET /api/v1/user/subscription` need one shared account snapshot contract in the first slice, or is that too wide for the initial pass?
4. Is customer pre-provisioning without immediate portal eligibility still the intended product rule, or do you want that revisited as part of this effort?
