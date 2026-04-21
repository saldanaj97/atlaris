# 306 — Deepen Stripe Commerce Boundary

Source: GitHub issue [#306](https://github.com/saldanaj97/atlaris/issues/306).

## Acceptance Criteria

- [x] Export `SubscriptionStatus`, `StripeWebhookResponse`, and
      `StripeCommerceBoundary` from one public billing commerce module.
- [x] `StripeCommerceBoundary` exposes exactly the three app-facing entry points
      proposed in the issue: `beginCheckout`, `openPortal`, and
      `acceptWebhook`.
- [x] Checkout routes stop coordinating price policy, redirect resolution,
      customer provisioning, and raw Stripe session creation directly.
- [x] Portal routes stop coordinating eligibility, redirect resolution, and raw
      Stripe portal creation directly.
- [x] Webhook routes stop coordinating signature verification, dev fallback,
      livemode filtering, dedupe, rollback, and event dispatch directly.
- [x] Live, local, and fake Stripe behavior are selected behind one gateway
      seam instead of through scattered route/env branching.
- [x] Local completion replay uses the same reconciliation path as canonical
      webhook processing.
- [x] `invoice.payment_succeeded` resync remains covered through the new
      boundary.
- [x] Boundary-first tests cover the issue-listed checkout, portal, webhook,
      and local-adapter scenarios.
- [x] Route-heavy and raw-client-heavy tests are slimmed so they keep only
      HTTP/preflight or adapter-wiring intent.
- [x] `src/features/billing/local-stripe.ts` retired; its in-process mock
      lives inside `stripe-commerce/local-gateway.ts`.
- [x] `syncSubscriptionToDb` no longer imports `db` from
      `@/lib/db/service-role` at module scope; deps supplied by the boundary
      factory (same shape already used by `createCustomer`).
- [x] Internal gateway DTOs (`CommerceWebhookEvent`,
      `CommerceSubscriptionSnapshot`) are defined once in
      `stripe-commerce/dtos.ts`; live/local/fake gateways return only these
      shapes, not raw `stripe` SDK types.
- [x] `src/features/billing/account-snapshot.ts` and
      `src/app/api/v1/user/subscription/route.ts` stop importing
      `canOpenBillingPortalForUser` directly; they consume the boundary or a
      narrow re-export.
- [x] `src/app/pricing/components/stripe-pricing.ts` either migrates off the
      direct `getStripe()` call via a boundary-exposed catalog read, or this
      plan's Out-of-scope section explicitly records why it stays.
- [x] Only the boundary factory reads `stripeEnv.localMode` /
      `localProductTestingEnv.enabled`; routes no longer branch on them.
- [ ] `pnpm test:changed` and `pnpm check:full` pass before the issue is closed.

## Phases

- [x] Phase 0 — Setup: keep this plan/todo pair aligned with the RFC and review
      feedback.
- [x] Phase 1 — Introduce the public commerce boundary contract and shared
      internal policies/gateway seam.
- [x] Phase 2 — Migrate checkout and portal flows behind the boundary.
- [x] Phase 3 — Migrate webhook orchestration and event application behind the
      boundary.
- [x] Phase 4 — Convert local Stripe behavior into a first-class adapter and
      thin local completion route.
- [x] Phase 5 — Add boundary/adaptor tests and slim legacy route/client tests.
- [ ] Phase 6 — Validation (`pnpm test:changed`, `pnpm check:full`) and
      acceptance-criteria walkthrough.
- [x] Phase 7 — Close issue #306 after merge (manual).

## Review

### Key decisions captured in the plan

- Public boundary should live behind one module (prefer
  `src/features/billing/stripe-commerce.ts`) with private adapters/collaborators
  colocated underneath it.
- Route factory test seams should shift from optional raw `Stripe` clients to
  optional `boundary?: StripeCommerceBoundary`.
- `STRIPE_LOCAL_MODE` remains the current selector, but only inside boundary
  composition / gateway selection.
- `createCustomer()` advisory-lock behavior is load-bearing and must be
  preserved during the refactor.
- The local completion route can remain as an HTTP endpoint for browser
  redirects, but its business logic should collapse into the boundary-owned
  local adapter / reconciliation path.

### Risks to watch during implementation

- Checkout policy currently lives in both `price-catalog.ts` and
  `local-catalog.ts`; centralize without changing approved catalog semantics.
- Subscription status mapping is currently embedded in
  `subscriptions.ts`; move it once and avoid parallel copies in transitions.
- Portal eligibility currently lives in both `create-portal/route.ts` and
  `account-snapshot.ts` via `portal-eligibility.ts`; moving the gate behind
  `openPortal()` forces a matching import update in `account-snapshot.ts` (and
  indirectly in `src/app/api/v1/user/subscription/route.ts`). This is a
  required ripple, not an optional one.
- Webhook processing currently mixes security preflight with event application;
  keep request-size and signature enforcement intact while moving orchestration.
- Redirect policy currently lives in
  `src/app/api/v1/stripe/_shared/redirect.ts`; move or absorb it deliberately so
  route-level redirect validation does not survive by accident.
- Route tests currently prove some boundary behavior; slimming them too early
  could create coverage gaps unless the new boundary specs land first.
- `syncSubscriptionToDb()` hard-depends on a module-level service-role `db`,
  while `createCustomer()` and `getSubscriptionTier()` already accept an
  injectable `dbClient`. Wiring all three through the boundary factory closes
  the inconsistency; missing this keeps the "hidden global write" gap the RFC
  explicitly calls out.
- `account-transitions.ts` already has explicit `TransitionDeps`; the refactor
  is a composition move, not a dependency-shape rewrite. Do not over-invent a
  second injection contract here.
- `src/app/pricing/components/stripe-pricing.ts` is a non-route direct caller
  of `getStripe()`. Leaving it in place silently contradicts "routes stop
  importing raw Stripe"; decide and document the direction in Step 4.0.4.
- Extra integration specs exist that the initial plan did not list
  (`webhook-events.spec.ts`, `usage.spec.ts`, `account-snapshot.spec.ts`).
  Audit each during Step 5.0 instead of ignoring them.

### Completion notes

- Implemented the public `src/features/billing/stripe-commerce.ts` surface plus
  the internal gateway/boundary modules under
  `src/features/billing/stripe-commerce/`.
- Slimmed Stripe routes to HTTP/auth/request parsing work and moved checkout,
  portal, webhook, local replay, and invoice resync orchestration behind the
  boundary.
- Follow-up seam fixes landed after review: local checkout replay now uses the
  injected DB end-to-end, portal creation goes through
  `gateway.createBillingPortalSession()`, and invoice resync goes through
  `gateway.retrieveSubscription()`.
- Validation:
  - `pnpm exec tsx scripts/tests/run.ts integration tests/integration/stripe/commerce-boundary.spec.ts`
  - `pnpm exec tsx scripts/tests/run.ts unit tests/unit/stripe/stripe-webhook-processor.spec.ts`
  - `pnpm check:full`
  - `pnpm test:changed` still fails for unrelated plans imports outside Stripe
    scope (`@/features/plans/lifecycle/plan-operations` missing in changed
    integration suites), so Phase 6 remains open even though the Stripe-specific
    validation is green.

### Status

Planning complete. Do not implement from this file until the user explicitly
starts execution.
