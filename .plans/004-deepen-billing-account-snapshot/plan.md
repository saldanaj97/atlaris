# Plan: Deepen Billing Account Snapshot Read Model (issue #305)

Implementation aligns with the approved Cursor plan (`billing_snapshot_read-model_boundary`). Supersedes earlier draft wording.

## Goal

One read-model boundary owns authenticated billing view: subscription fields, Stripe ids, portal eligibility, and (for `full`) usage — with usage limits derived from the same tier as the billing row (no duplicate `resolveUserTier`).

## Interface

- `getBillingAccountSnapshot({ userId, dbClient?, correlationId?, projection? })`
- Default `projection`: `'full'` → `BillingAccountSnapshot` (includes `usage`).
- `projection: 'subscription'` → `BillingSubscriptionSnapshot` (no usage DB work).

`getUsageSummary(userId, dbClient?, resolvedTier?)` — when `resolvedTier` is set, skips `resolveUserTier`.

## Files touched

- `src/features/billing/account-snapshot.ts`, `usage-metrics.ts`
- `src/app/settings/billing/components/BillingCards.tsx`
- `src/app/plans/components/PlansContent.tsx`
- `src/app/api/v1/user/subscription/route.ts`
- `src/app/pricing/page.tsx`
- Tests: `tests/integration/stripe/account-snapshot.spec.ts`, `usage.spec.ts`, `tests/unit/app/pricing/page.spec.tsx`

## Out of scope

- `create-portal` route stays on `canOpenBillingPortalForUser(user)` (mutation-adjacent).
- Quota / webhook refactors.

## Validation

Targeted vitest files, then `pnpm test:changed` and `pnpm check:full`.
