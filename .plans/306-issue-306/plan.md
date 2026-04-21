# Plan: Deepen Stripe Commerce Boundary (issue #306)

Source: GitHub issue [#306](https://github.com/saldanaj97/atlaris/issues/306).

## Goal

Create one app-facing Stripe commerce boundary that owns hosted checkout,
hosted portal, and webhook ingestion/reconciliation so API routes stop
coordinating Stripe policy, provider selection, and webhook side effects
directly.

The finished shape should keep the public API small and route-shaped while
hiding:

- live-vs-local provider selection
- checkout price policy and redirect validation
- customer provisioning and idempotent reuse
- portal eligibility and return URL handling
- webhook payload security, signature verification, dedupe, and event dispatch
- subscription reconciliation, including `invoice.payment_succeeded` resync
- local completion replay through the same reconciliation path as live webhook
  processing

## Planning decisions

- Prefer one public module, e.g. `src/features/billing/stripe-commerce.ts`,
  with internal collaborators under a colocated subdirectory such as
  `src/features/billing/stripe-commerce/`.
- Route factories should stop accepting raw `Stripe` clients and instead accept
  `boundary?: StripeCommerceBoundary`, matching the deeper-boundary pattern used
  in `.plans/003-deepen-session-boundary/`.
- Keep `STRIPE_LOCAL_MODE` as the composition-time selector for now, but move
  that branching into the boundary factory / gateway selection instead of
  leaving it in routes and generic client helpers.
- Keep the local completion HTTP route for browser redirects, but make it thin
  transport glue around the same reconciliation path the webhook boundary uses.
- Preserve existing auth/data loading responsibilities: callers still supply the
  authenticated actor data they already own; the new boundary owns Stripe
  commerce policy, not general user lookup or billing read-model projection.
- Keep unrelated helpers in `src/features/billing/subscriptions.ts` stable
  unless a minimal import move is unavoidable. In particular,
  `getSubscriptionTier()` and `cancelSubscription()` are not part of the RFC
  boundary contract and should not be broadened into the new module.
- Private gateway contracts should return minimal domain DTOs / structural data,
  not leak raw `stripe` package types through the internal seam any more than
  necessary.

## Expected files touched

### New

- `src/features/billing/stripe-commerce.ts`
- `src/features/billing/stripe-commerce/gateway.ts`
- `src/features/billing/stripe-commerce/dtos.ts` (`CommerceWebhookEvent`,
  `CommerceSubscriptionSnapshot`, and any other gateway-return DTOs so the
  internal seam does not leak raw `stripe` SDK types)
- `src/features/billing/stripe-commerce/live-gateway.ts`
- `src/features/billing/stripe-commerce/local-gateway.ts` (absorbs the
  in-process mock currently in `src/features/billing/local-stripe.ts` plus the
  synthetic webhook-event construction currently in
  `src/app/api/v1/stripe/local/complete-checkout/route.ts`)
- `src/features/billing/stripe-commerce/fake-gateway.ts`
- `src/features/billing/stripe-commerce/price-policy.ts`
- `src/features/billing/stripe-commerce/subscription-status.ts`
- `tests/integration/stripe/commerce-boundary.spec.ts`
- `tests/integration/stripe/local-gateway.spec.ts`

### Refactor

Routes and route-adjacent helpers:

- `src/app/api/v1/stripe/create-checkout/route.ts`
- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/app/api/v1/stripe/webhook/route.ts`
- `src/app/api/v1/stripe/local/complete-checkout/route.ts`
- `src/app/api/v1/stripe/_shared/redirect.ts`

Billing internals (move behind the boundary or rewire to it):

- `src/features/billing/client.ts`
- `src/features/billing/local-stripe.ts` (retire module; contents move into
  `local-gateway.ts` under the boundary)
- `src/features/billing/subscriptions.ts` (`syncSubscriptionToDb` today
  imports `db` from `@/lib/db/service-role` at module scope with no
  injection; move behind boundary composition with explicit deps, in line
  with `createCustomer`'s existing injectable `dbClient` pattern)
- `src/features/billing/stripe-webhook-processor.ts`
- `src/features/billing/account-transitions.ts` (already takes explicit
  `TransitionDeps`; rewire as a named write-side collaborator of the
  boundary factory rather than rewriting its injection shape)
- `src/features/billing/portal-eligibility.ts` (becomes internal to the
  boundary; see downstream update below)
- `src/features/billing/price-catalog.ts`
- `src/features/billing/local-catalog.ts`
- `src/features/billing/validation/stripe.ts`
- `src/features/billing/validation/stripe.schemas.ts`
- `src/features/billing/validation/stripe.types.ts`

Downstream (required import/typing updates once boundary lands):

- `src/features/billing/account-snapshot.ts` — currently imports
  `canOpenBillingPortalForUser` from `portal-eligibility.ts`. That helper
  becomes internal to the boundary, so `account-snapshot.ts` must switch to
  the boundary-exposed eligibility type or a narrow re-export.
- `src/app/api/v1/user/subscription/route.ts` — consumes the billing read
  model derived from the snapshot; verify its response shape is unaffected
  once the eligibility helper import moves.
- `src/app/pricing/components/stripe-pricing.ts` — currently calls
  `getStripe()` directly from a non-route module. Either migrate to a
  boundary-owned catalog read path or explicitly document why pricing keeps
  the direct SDK call during this refactor (see Step 4.0).

Config / env (no behavior change; relocate selection, keep env names):

- `src/lib/config/env/billing.ts` — `stripeEnv.localMode` stays the selector
  input, but only the boundary factory reads it.
- `src/lib/config/env.ts` — re-export surface should continue to expose
  `stripeEnv` but routes should stop branching on `stripeEnv.localMode`.
- `src/lib/config/local-product-testing.ts` — used by
  `local/complete-checkout/route.ts`; keep the gate but move the behavior
  behind the local gateway.

### Slim or rewrite tests

- `tests/integration/stripe/create-checkout.spec.ts`
- `tests/integration/stripe/api-routes.spec.ts`
- `tests/integration/stripe/create-portal-malformed-non-error.spec.ts`
- `tests/integration/stripe/subscriptions.spec.ts`
- `tests/integration/stripe/webhook-events.spec.ts`
- `tests/integration/stripe/usage.spec.ts` (audit whether any assertions are
  actually Stripe-orchestration-shaped and belong behind the boundary)
- `tests/integration/stripe/account-snapshot.spec.ts` (update only if the
  eligibility import move changes observable snapshot shape)
- `tests/unit/stripe/client.spec.ts`
- `tests/unit/stripe/stripe-webhook-processor.spec.ts`

## Implementation steps

### Step 1.0 — Confirm contract and boundary layout

1. Mirror the issue contract in code and tests:
   - `SubscriptionStatus`
   - `StripeWebhookResponse`
   - `StripeCommerceBoundary` with `beginCheckout`, `openPortal`, and
     `acceptWebhook`
2. Decide the exported public entrypoint and keep all adapter details private to
   the boundary package.
3. Switch the intended test seam from raw `Stripe` injection to boundary
   injection at route factories.

### Steps 1.1–1.4 — Build shared internal collaborators first

1. **Write tests first** for the policy pieces currently duplicated across
   routes/helpers:
   - approved live checkout price validation
   - local checkout price validation
   - redirect validation/defaulting for checkout and portal
   - subscription status mapping (`active`, `canceled`, `past_due`,
     `trialing`, `null`)
2. Extract shared collaborators behind the boundary:
   - checkout price policy (today split across
     `price-catalog.ts` and `local-catalog.ts`)
   - subscription status mapping (today embedded in
     `subscriptions.ts` and transition logic)
   - gateway contract for live/local/fake implementations
   - shared redirect policy currently implemented in
     `src/app/api/v1/stripe/_shared/redirect.ts`
3. Keep `createCustomer()` advisory-lock semantics intact (today uses
   `dbClient.transaction` + `pg_advisory_xact_lock` on a constant key +
   `hashtext(userId)`). The refactor should move ownership, not weaken
   concurrency protection.
4. Keep Stripe error details available in logs/`AppError` metadata even after
   translation to domain-level route responses.
5. Remove hidden global write dependencies from boundary-owned helpers. In
   particular, `syncSubscriptionToDb()` currently imports `db` from
   `@/lib/db/service-role` at module scope with no injection point; rewire it
   to accept an injected client the way `createCustomer` / `getSubscriptionTier`
   already do, and have the boundary factory supply it.
6. Define the internal gateway DTOs explicitly (`CommerceWebhookEvent`,
   `CommerceSubscriptionSnapshot`) in `stripe-commerce/dtos.ts` so live/local/
   fake gateways all return the same shapes and raw `stripe` types do not leak
   through the adapter seam.

### Step 2.0 — Migrate checkout and portal flows behind the boundary

1. **Write boundary-first tests** for:
   - checkout success
   - approved price enforcement
   - local price enforcement
   - invalid redirect rejection
   - checkout Stripe client failure mapping
   - portal eligibility rejection
   - portal return URL validation
   - portal session failure mapping
2. Move checkout orchestration behind `beginCheckout()`:
   - input validation stays at HTTP/body shape level in the route
   - price policy, redirect resolution, customer provisioning, and session
     creation move into the boundary
3. Move portal orchestration behind `openPortal()`:
   - caller supplies actor snapshot (`userId`, `stripeCustomerId`,
      `subscriptionStatus`)
   - `canOpenBillingPortalForUser()` becomes an internal collaborator of the
     boundary rather than a route-level gate
   - redirect resolution and session creation move into the boundary
   - update `src/features/billing/account-snapshot.ts` (currently the other
     direct caller of `canOpenBillingPortalForUser`) to consume the boundary
     or a narrow re-export; do not duplicate the eligibility rule
4. Update both routes to thin HTTP preflight:
   - auth/rate limit wrappers stay in the route
   - routes call the boundary and serialize its result
   - route tests keep only HTTP-level behavior that is still route-owned

### Step 3.0 — Migrate webhook security and event application behind the boundary

1. **Write boundary-first tests** for:
   - missing signature
   - invalid signature
   - payload too large (`content-length` preflight and raw body size)
   - dev-mode JSON noop path
   - livemode mismatch handling
   - duplicate event handling
   - successful event application
   - `invoice.payment_succeeded` resync
2. Move webhook orchestration into `acceptWebhook()`:
   - signature verification / dev fallback
   - livemode guard
   - dedupe insert + rollback-on-failure
   - event dispatch
3. Narrow `stripe-webhook-processor.ts` into an internal collaborator or retire
   it if the boundary fully absorbs its remaining public value.
4. Rewire `account-transitions.ts` as a named write-side collaborator of the
   boundary factory. It already accepts explicit `TransitionDeps`, so the move
   is composition-only: the boundary factory should be the component that
   supplies its deps, not a route or a module global.
5. Keep the webhook route responsible only for request-body acquisition,
   request-id context, rate-limit preflight, and HTTP response construction.

### Step 4.0 — Fold local Stripe behavior into a first-class adapter

1. **Write local-adapter contract tests** for:
   - checkout session URL creation
   - local portal session creation
   - local price/product lookup
   - synthetic subscription replay semantics
2. Convert the current local-mode story into a real adapter:
   - `client.ts` stops deciding live vs local for the whole app surface
   - `local-stripe.ts` retires; its in-process mock moves inside
     `stripe-commerce/local-gateway.ts`
   - local gateway implements the same internal contract as the live gateway
   - only the boundary factory reads `stripeEnv.localMode` /
     `localProductTestingEnv.enabled`
3. Keep `/api/v1/stripe/local/complete-checkout` only as transport glue for the
   browser redirect:
   - validate query params
   - call the same reconciliation path used by live webhook handling
   - avoid route-local business logic duplication
4. Decide pricing component direction:
   - `src/app/pricing/components/stripe-pricing.ts` currently calls
     `getStripe()` directly. Either (a) expose a narrow catalog read on the
     boundary and migrate `fetchStripeTierData`, or (b) explicitly document
     that pricing-catalog reads remain outside the commerce boundary for this
     RFC and record the rationale. Do not leave an undocumented direct-SDK
     caller after the refactor.

### Step 5.0 — Reshape the tests and retire shallow seams

1. Add new high-signal specs around the boundary and local adapter.
2. Slim existing route-heavy tests so they assert only route-owned behavior:
   - auth/rate-limit wrappers
   - malformed JSON / HTTP preflight
   - request/response serialization
3. Narrow or delete tests that only exist because Stripe details were leaked at
   the old seam:
   - `tests/unit/stripe/client.spec.ts`
   - parts of `tests/unit/stripe/stripe-webhook-processor.spec.ts`
   - route-heavy assertions in `tests/integration/stripe/api-routes.spec.ts`
   - orchestration-heavy assertions in `tests/integration/stripe/subscriptions.spec.ts`
   - `tests/integration/stripe/webhook-events.spec.ts` — move event-application
     assertions under the boundary spec; keep only truly HTTP-shaped ones
   - `tests/integration/stripe/usage.spec.ts` — audit for assertions that are
     really Stripe orchestration (move behind boundary) versus usage/metering
     contract (keep)
   - `tests/integration/stripe/account-snapshot.spec.ts` — only touch if the
     `portal-eligibility` import move changes observable shape
4. Keep a small number of adapter-specific tests for the live/local/fake
   gateway contract.

### Validation steps

1. Run targeted specs for the new boundary and the slimmed route suites.
2. Run `pnpm test:changed`.
3. Run `pnpm check:full`.
4. If any integration/security command needs Docker and Docker is unavailable,
   stop and call that out explicitly rather than masking the gap.

### Issue verification and closure

1. Verify each issue requirement against the final tree:
   - routes no longer coordinate raw Stripe flows directly
   - boundary owns checkout, portal, webhook, and local-mode orchestration
   - gateway selection hides live/local/fake provider differences
   - `invoice.payment_succeeded` resync remains covered
   - local completion reuses the canonical reconciliation path
2. Verify old test seams were narrowed rather than duplicated.
3. Close issue #306 only after merge and after the acceptance-criteria checklist
   in `.plans/306-issue-306/todos.md` is fully checked off.

## Out of scope

- Changing pricing UI copy or catalog presentation
- Reworking billing read-model consumers beyond the import/type adjustment in
  `account-snapshot.ts` and `src/app/api/v1/user/subscription/route.ts` that
  the `portal-eligibility` move forces
- Broadening unrelated subscription helpers such as `getSubscriptionTier()` or
  `cancelSubscription()` into the new commerce boundary
- Expanding the boundary to non-Stripe billing concerns such as usage/quota
  enforcement unrelated to checkout/portal/webhook orchestration
- Renaming or restructuring `STRIPE_LOCAL_MODE` and related env keys; the
  refactor relocates where they are read, not what they are called
