# Plan: Deepen Billing Account Snapshot Read Model (issue #305)

## Goal

Stop making callers assemble billing state from multiple seams. One read-model
boundary should own the authenticated billing view, including portal
eligibility and usage assembly, while allowing lighter consumers to request a
subscription-only projection.

## Current seam

- `src/features/billing/account-snapshot.ts` loads subscription fields from
  `users` and then delegates to `getUsageSummary(userId, dbClient)`.
- `src/features/billing/usage-metrics.ts` calls `resolveUserTier(userId,
  dbClient)` again before deriving limits, so the full snapshot resolves tier
  through two paths in one request.
- Read consumers are split:
  `src/app/settings/billing/components/BillingCards.tsx`,
  `src/app/plans/components/PlansContent.tsx`, and
  `src/app/api/v1/user/subscription/route.ts` use the full snapshot, while
  `src/app/pricing/page.tsx` bypasses the boundary and computes portal
  eligibility from the auth user directly.
- `src/app/api/v1/stripe/create-portal/route.ts` also uses
  `canOpenBillingPortalForUser(user)`, but that path is mutation-adjacent and
  should not be dragged into the read-model refactor without evidence.

## Scope

In:

- Canonical billing snapshot boundary for authenticated read surfaces
- Subscription-only projection for read consumers that only need lifecycle /
  portal affordance data
- Reuse the already-loaded tier when deriving full-projection usage limits
- Migrate current read consumers onto the boundary
- Reshape tests so the boundary owns billing read assertions

Out:

- Quota reservation / rollback behavior in
  `src/features/plans/lifecycle/plan-operations.ts`
- Stripe webhook / transition refactors outside what the read boundary needs
- Checkout or portal session mutation flow redesign

## Proposed interface

Use an args object with a discriminated projection. Default to `full`.

```ts
export type BillingAccountProjection = 'full' | 'subscription';

export type BillingSubscriptionSnapshot = {
  tier: SubscriptionTier;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
  subscriptionPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  canOpenBillingPortal: boolean;
};

export type BillingAccountSnapshot = BillingSubscriptionSnapshot & {
  usage: UsageSummary;
};

export async function getBillingAccountSnapshot(args: {
  userId: string;
  dbClient?: DbClient;
  correlationId?: string;
  projection?: 'full';
}): Promise<BillingAccountSnapshot>;

export async function getBillingAccountSnapshot(args: {
  userId: string;
  dbClient?: DbClient;
  correlationId?: string;
  projection: 'subscription';
}): Promise<BillingSubscriptionSnapshot>;
```

Reason: current positional params are already stretched, and projection needs
to be explicit. Anything looser invites more shallow wrapper creep.

## Phase plan

### Step 0.0 — Fetch issue, confirm ACs

- Confirm issue #305 title/body still match the live billing seam.
- Lock the scope to read consumers plus the boundary itself.
- Create `.plans/004-deepen-billing-account-snapshot/{todos.md,plan.md}`.

### Step 1.0 — Boundary contract and internal ownership

- Refactor `src/features/billing/account-snapshot.ts` to export:
  `BillingAccountProjection`, `BillingSubscriptionSnapshot`,
  `BillingAccountSnapshot`, and the overloaded args-object signature.
- Add one private user-row loader that reads all billing fields once.
- Keep `BillingSnapshotNotFoundError` at the boundary so not-found semantics
  remain local to the module.
- Compute `canOpenBillingPortal` inside the boundary from the loaded row.
- Change usage assembly so the full projection passes the already-loaded tier
  into usage-limit derivation instead of letting `usage-metrics.ts` call
  `resolveUserTier()` again.
- Preferred shape in `src/features/billing/usage-metrics.ts`:
  keep `getUsageSummary(userId, dbClient)` for existing non-read callers, but
  add an internal helper that accepts `{ userId, tier, dbClient }` so the
  boundary can avoid duplicate tier reads.

### Steps 1.1–1.3 — Consumer migration

1. `src/app/settings/billing/components/BillingCards.tsx`
   Use the default full projection. No UI contract change expected.
1. `src/app/plans/components/PlansContent.tsx`
   Use the default full projection for usage badge/list data.
1. `src/app/api/v1/user/subscription/route.ts`
   Use the default full projection via the new args object. Keep response JSON
   stable unless tests prove drift.
1. `src/app/pricing/page.tsx`
   Replace direct `canOpenBillingPortalForUser(user)` usage with a
   subscription-only boundary read inside `withServerComponentContext`.
1. `src/app/api/v1/stripe/create-portal/route.ts`
   Leave direct unless implementation uncovers a real consistency bug. Record
   the rationale in the review section instead of half-migrating it.

### Step 2.0 — Test reshaping

- Expand `tests/integration/stripe/account-snapshot.spec.ts` or split it into a
  fuller boundary-focused spec that covers:
  - full snapshot for free tier
  - full snapshot for active subscriber with usage counts
  - subscription-only projection with portal eligibility
  - pre-created Stripe customer with no lifecycle keeps portal closed
  - missing user throws the boundary error
  - full snapshot keeps `snapshot.tier` and `snapshot.usage` limits coherent
- Narrow `tests/integration/stripe/usage.spec.ts` so usage tests cover metrics
  semantics, month partitioning, and persistence behavior, not billing snapshot
  assembly.
- Update any consumer tests broken by the new interface, most likely:
  - `tests/unit/app/pricing/page.spec.tsx`
  - `tests/integration/api/user-subscription.spec.ts`
  - `tests/integration/stripe/api-routes.spec.ts`

### Validation Steps

- Targeted tests while iterating:
  - `pnpm vitest tests/integration/stripe/account-snapshot.spec.ts`
  - `pnpm vitest tests/integration/stripe/usage.spec.ts`
  - `pnpm vitest tests/unit/app/pricing/page.spec.tsx`
  - `pnpm vitest tests/integration/api/user-subscription.spec.ts`
  - `pnpm vitest tests/integration/stripe/api-routes.spec.ts`
- Final baseline:
  - `pnpm test:changed`
  - `pnpm check:full`

### Issue Verification & Closure

- Re-walk every acceptance criterion against the final diff.
- Verify pricing now uses the boundary projection, not raw
  `canOpenBillingPortalForUser(user)`.
- Verify the full snapshot no longer performs a second tier lookup for usage
  limits.
- Record whether `create-portal` stayed direct and why.
- Close issue #305 only after validation commands are green.

## Expected files

Refactor:

- `src/features/billing/account-snapshot.ts`
- `src/features/billing/usage-metrics.ts`
- `src/app/settings/billing/components/BillingCards.tsx`
- `src/app/plans/components/PlansContent.tsx`
- `src/app/api/v1/user/subscription/route.ts`
- `src/app/pricing/page.tsx`

Likely unchanged unless evidence appears:

- `src/app/api/v1/stripe/create-portal/route.ts`
- `src/features/billing/portal-eligibility.ts`

Tests:

- `tests/integration/stripe/account-snapshot.spec.ts`
- `tests/integration/stripe/usage.spec.ts`
- `tests/unit/app/pricing/page.spec.tsx`
- `tests/integration/api/user-subscription.spec.ts`
- `tests/integration/stripe/api-routes.spec.ts`
