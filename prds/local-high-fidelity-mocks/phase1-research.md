# Phase 1: Foundation and Core Product Flows — Research

> **Parent PRD:** `prds/local-high-fidelity-mocks/prd.md`
> **Research date:** 2026-03-30
> **Scope:** Local product testing only; staging covers real auth/session verification

---

## Slice 1: Local Product-Testing Contract and Bootstrap

### Current State

The repo already has several local-safe seams, but they are fragmented:

- `DEV_AUTH_USER_ID` can override the effective auth user on the server side in development and test.
- AI already defaults to the runtime mock provider in development.
- AV defaults to heuristic-only mode via `AV_PROVIDER=none` in non-production.
- Stripe still requires a real secret by default.
- The local DB bootstrap creates schema and grants, but it does not seed product-testing users or data.
- Existing docs already warn that `DEV_AUTH_USER_ID` only works if the referenced user exists in the DB.

The missing piece is not another abstraction stack. The missing piece is one explicit local product-testing contract that says:

1. what local mode is for;
2. which env/settings control it;
3. what seeded data it assumes;
4. which hosted-service behaviors are still intentionally real or deferred.

### Recommended Direction

- Add one top-level local product-testing mode concept for development/test only.
- Keep explicit per-service settings where needed, but define precedence instead of letting behavior emerge accidentally.
- Seed at least one deterministic local user as part of bootstrap.
- Treat minimal bootstrap/docs as foundation work, not later polish.
- Fail closed in production if local product-testing mode is enabled.

### Files Likely To Change

- `src/lib/config/env.ts`
- `scripts/bootstrap-local-db.ts`
- `.env.example`
- `docs/development/environment.md`
- `docs/development/local-database.md`
- `docs/development/commands.md`
- Likely new helper: `src/lib/config/local-product-testing.ts`

### Implementation Steps

1. Define the local product-testing contract and config precedence.
2. Add production-safety validation.
3. Extend local DB bootstrap to seed deterministic product-testing users and any minimum supporting data.
4. Document required env/bootstrap steps immediately.
5. Validate bootstrap from a clean local environment.

### Risks

- If precedence is left ambiguous, local behavior will become another patchwork.
- If seeded data is treated as optional, local auth and billing will remain brittle.
- If bootstrap/docs land too late, later phases will be built on hidden setup assumptions.

---

## Slice 2: Seeded Local Identity Path

### Current State

The existing seam is useful, but narrower than the old docs implied:

- `getEffectiveAuthUserId()` already supports `DEV_AUTH_USER_ID` in development and test.
- auth wrappers and server-side RLS context reuse that seam correctly.
- `ensureUserRecord()` still tries to provision from a real auth session if the DB user is missing.
- proxy bypass only covers `/api/*`, so protected product pages can still redirect through real Neon middleware.
- header/app shell auth state still reads real session state in some places.

This means local auth should be reframed as **seeded local identity selection**, not local session emulation.

### Recommended Direction

- Require local product testing to use an existing seeded user.
- Do not auto-provision users in local mode.
- Keep real-session-only paths real-session-only.
- Expand development-only protected-route access only as far as needed for local product pages and protected API requests.
- Make the visible app shell consistent with the active local user state.

### Files Likely To Change

- `src/lib/api/auth.ts`
- `src/proxy.ts`
- `src/components/shared/SiteHeader.tsx`
- `src/app/layout.tsx`
- `src/lib/config/env.ts`
- Likely new helper: `src/lib/auth/local-identity.ts`
- New test file: `tests/integration/auth/local-auth-mode.spec.ts`

### Implementation Steps

1. Make seeded-user existence a hard requirement for local identity mode.
2. Change missing-user behavior from auto-provision attempt to clear failure in local mode.
3. Add a narrow development-only path for protected page access.
4. Align shell/header behavior with the same local identity source.
5. Verify protected page, protected API, and protected server-action behavior locally.

### Risks

- Over-broad proxy bypass would make local behavior too permissive.
- Leaving shell/header behavior unchanged would create server/client auth drift.
- Treating seeded-user mode as a fake session system would recreate the original confusion.

---

## Slice 3: Stripe / Billing Local Provider and Webhook Simulator

### Current State

Billing already exposes the right seams, but the local story is incomplete:

- service functions already accept injected Stripe clients;
- checkout and portal handlers are factory-based and mock-friendly;
- pricing still depends on live Stripe-derived data by default;
- subscription state changes are webhook-driven;
- the current no-secret dev webhook path is a noop for DB sync;
- portal flow currently assumes an `https` URL on the client side.

The critical observation is that local billing fidelity depends on preserving **webhook-driven state changes**, not on generating fake checkout URLs.

### Recommended Direction

- Reuse existing Stripe DI seams instead of creating a parallel billing architecture.
- Add one canonical local billing catalog used by pricing, checkout, portal, and webhook simulation.
- Keep checkout/portal flows realistic, but preserve webhook-driven DB mutation as the canonical state-change path.
- Refactor webhook event processing so both the real webhook route and a local simulator can reuse it.
- Support a small set of high-value local billing scenarios only.

### Files Likely To Change

- `src/features/billing/client.ts`
- `src/features/billing/subscriptions.ts`
- `src/app/api/v1/stripe/create-checkout/route.ts`
- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/app/api/v1/stripe/webhook/route.ts`
- `src/app/pricing/components/pricing-config.ts`
- `src/app/pricing/components/stripe-pricing.ts`
- `src/components/billing/ManageSubscriptionButton.tsx`
- `src/features/billing/validation/stripe.ts`
- Likely new files:
  - `src/features/billing/local-catalog.ts`
  - `src/features/billing/local-stripe.ts`
  - `src/features/billing/webhook-processor.ts`
  - a local-only webhook simulation route or action

### Implementation Steps

1. Define the canonical local billing catalog.
2. Route local pricing, checkout, and portal through the catalog and local provider.
3. Extract shared webhook event-processing logic.
4. Add a local event simulator that still exercises dedupe, rollback, and DB writes.
5. Verify success and failure scenarios against seeded local users.

### High-Value Local Scenarios

- starter or pro checkout success
- portal access
- duplicate webhook replay
- payment failure
- cancellation / subscription deleted
- bad price ID
- price lookup failure during sync

### Risks

- If local checkout writes DB state directly, billing will drift from production quickly.
- If the billing catalog is not canonical, pricing and subscription sync will diverge.
- If local portal only works for `https`, local smoke testing will be artificially blocked.

---

## Cross-Slice Notes

### Recommended Implementation Order

```text
Slice 1: Local product-testing contract and bootstrap
  -> Slice 2: Seeded local identity path
  -> Slice 3: Stripe / billing local provider and webhook simulator
```

### Why This Order

- Billing depends on deterministic local users and bootstrap.
- Identity behavior must be stable before product flows are trustworthy.
- Bootstrap, auth, and billing are the minimum viable local product-testing foundation.

### Validation Commands

- `pnpm db:dev:up`
- `pnpm db:dev:bootstrap`
- `./scripts/test-integration.sh tests/integration/auth/local-auth-mode.spec.ts`
- `./scripts/test-integration.sh tests/integration/stripe/create-checkout.spec.ts`
- `./scripts/test-integration.sh tests/integration/stripe/api-routes.spec.ts`
- `./scripts/test-integration.sh tests/integration/stripe/subscriptions.spec.ts`
- `pnpm test:changed`

### Manual Validation

1. Start the local DB and bootstrap it.
2. Run the app with local product-testing mode enabled.
3. Select or configure a seeded local user.
4. Verify protected product pages and protected APIs resolve that user locally.
5. Verify pricing, checkout, portal, and webhook-driven subscription changes work without real Stripe.
