# Clerk Billing Architecture

**Audience:** Developers working on entitlements, pricing checkout, quotas, or billing webhooks.  
**Last Updated:** August 2026

Atlaris keeps a **single entitlement source**: Postgres `users` subscription columns projected from Clerk Billing webhooks and reconciliation. Do **not** gate features with Clerk `auth().has({ plan })` alongside DB tiers.

Local fixture mode, env checklists, and manual checkout verification live in [environment.md](../development/environment.md#clerk-development-checkout-fixture-vs-real-payment-flow). This page covers the runtime architecture.

## Flow overview

```text
Clerk Checkout / Dashboard
        │
        ▼  Svix-signed events
POST /api/v1/clerk/billing/webhook
        │
        ├── insert clerk_webhook_events (idempotent on svix-id)
        ├── map event → ClerkBillingProjectionSource
        ├── optional refresh: clerkClient.billing.getUserBillingSubscription
        └── UPDATE users (tier, status, period_end, cancel_at_period_end)
                │
                ├── GET /api/v1/user/subscription  → Settings #billing / #usage
                └── quota boundaries (plans, regenerations, lesson generations)
```

Drift repair (no webhook): `POST /api/internal/maintenance/billing/reconcile-clerk` when `CLERK_BILLING_RECONCILIATION_ENABLED=true`. See [internal-worker-routes.md](./internal-worker-routes.md).

## Webhook path

| Concern | Detail |
| ------- | ------ |
| Route | `POST /api/v1/clerk/billing/webhook` → `src/app/api/v1/clerk/billing/webhook/route.ts` |
| Auth | IP rate limit (`webhook` bucket) → require `svix-id` → body ≤ 256 KiB → `verifyWebhook` with `CLERK_WEBHOOK_SIGNING_SECRET` |
| Apply | `applyVerifiedClerkBillingEvent` in `src/features/billing/clerk-billing/reconciliation.ts` |
| DB client | Service-role (no user session); signature verification is the trust boundary |

### Event types

Prefix matching in `src/features/billing/clerk-billing/projection.ts`:

| Prefix | Handler |
| ------ | ------- |
| `subscriptionItem.` | Single subscription item |
| `subscription.` | All items on the subscription |
| `paymentAttempt.` | Items plus payment attempt status |

Other types are ignored (`status: 'ignored'`). Subscribe the Clerk endpoint to `subscription.*`, `subscriptionItem.*`, and `paymentAttempt.*`.

### Idempotency

Table `clerk_webhook_events` stores Svix delivery IDs (`event_id` unique). Duplicate inserts return `{ ok: true, status: 'duplicate' }` with HTTP 200 so Clerk does not retry forever. Rows older than 45 days are pruned by retention cleanup.

### Projection into `users`

Lookup: `users.auth_user_id` = Clerk payer user id (`user_...`).

| Column | Meaning |
| ------ | ------- |
| `subscription_tier` | `free` \| `starter` \| `pro` |
| `subscription_status` | `active` \| `canceled` \| `past_due` \| `trialing` |
| `subscription_period_end` | Period end timestamp |
| `cancel_at_period_end` | Boolean |

Plan slug → tier mapping lives in `src/features/billing/clerk-billing/plan-mapping.ts`:

| Clerk plan slug | Atlaris tier |
| --------------- | ------------ |
| `free_user` | `free` |
| `starter_plan` | `starter` |
| `pro_plan` | `pro` |

Free and starter may share a Clerk plan id; amount (`0` vs paid) plus slug disambiguate. Projection rules (highest paid tier, past-due retention, canceled-but-in-period, terminal downgrade to free) are implemented in `projectClerkBillingSource` — read that function before changing entitlement semantics.

Webhook applies refresh from Clerk Billing API (`refreshFromClerk: true`) before writing. Local fixtures call `applyClerkBillingSource` **without** refresh or webhook idempotency insert.

## Checkout return sync

When Clerk UI is enabled, `/pricing` builds a return URL:

```text
/settings?checkout=1&checkoutBaseline=<tier|status|periodEnd|cancelFlag>#billing
```

| Piece | Source |
| ----- | ------ |
| Baseline | `getOptionalCheckoutBillingSignature` / `buildCheckoutBillingSignature` in `src/features/billing/checkout-return*.ts` |
| UI | `CheckoutSubscriptionSync` under Settings `#billing` |
| Poll | `GET /api/v1/user/subscription` every 2s for up to 30s |
| Done | Current signature ≠ baseline → clear query params, `router.refresh()` |

Settings remains DB-backed. Manage/current-plan Clerk buttons live on `/pricing` (`ClerkPricingTable`), not in Settings.

### Pricing UI modes

| Mode | Condition | UI |
| ---- | --------- | -- |
| Clerk | `shouldUseClerkUi()` true | `ClerkPricingTable` (live plans / checkout) |
| Local preview | Local product testing (`LOCAL_PRODUCT_TESTING` + `DEV_AUTH_USER_ID`) | `LocalPricingPreview` — CTAs disabled |

## Subscription API

`GET /api/v1/user/subscription` (`src/app/api/v1/user/subscription/route.ts`) returns tier, status, period end, cancel flag, and usage meters from `getBillingAccountSnapshot`. Auth via `requestBoundary.route` with read rate limit.

## Quotas and meters

Tier caps: `src/shared/constants/tier-limits.ts` (`TIER_LIMITS` for `free` / `starter` / `pro`).

| Cap | Enforcement |
| --- | ----------- |
| Active plans | `atomicCheckAndInsertPlan` / `countPlansContributingToCap` |
| Plan duration (`maxWeeks`) | `checkPlanDurationCap` during creation |
| Monthly regenerations | `runRegenerationQuotaReserved` → `usage_metrics.regenerations_used` |
| Monthly lesson generations | `runLessonGenerationQuotaReserved` → `usage_metrics.lesson_modules_generated` |
| AI model allowlist | `validateModelForTier` / settings AI section |
| Monthly exports | Limits appear in `TIER_LIMITS` and Settings usage UI; **no production route reserves the `export` meter yet** |

Metered reservation core: `src/features/billing/metered-reservation.ts`. Boundaries wrap reserve → work → compensate on failure. Month key is `YYYY-MM` on `usage_metrics`.

## Local / fixture tooling

| Command | Purpose |
| ------- | ------- |
| `pnpm billing:clerk:fixture -- --user-id <auth_user_id> --plan pro` | Apply projection for a local user (localhost Postgres only unless `--allow-non-local true`) |
| `pnpm dev:local:starter` | Start DB, seed, fixture starter, `pnpm dev` |
| `pnpm dev:local:pro` | Same for pro |

### Pitfalls

1. Fixture mode **disables** Clerk UI — it does not exercise checkout or webhooks.
2. Do not mix `LOCAL_PRODUCT_TESTING=false` with a set `DEV_AUTH_USER_ID` (startup guard).
3. Fixture `--user-id` must match `users.auth_user_id` (seed id `00000000-0000-4000-8000-000000000001`).
4. Clerk Dashboard plan slugs must match `plan-mapping.ts` exactly (`free_user`, not `free`).
5. Local webhook testing needs a public tunnel to `/api/v1/clerk/billing/webhook`.

## Settings surfaces

Single page `/settings` (`SettingsLedgerPage`):

| Hash | Content |
| ---- | ------- |
| `#billing` | Checkout sync + plan rows from DB snapshot |
| `#usage` | Active plans / regenerations / exports / lesson generations meters |
| `#ai` | Model picker gated by `actor.subscriptionTier` |

## Code map

| Area | Path |
| ---- | ---- |
| Projection / plan mapping | `src/features/billing/clerk-billing/` |
| Reconciliation + webhook apply | `src/features/billing/clerk-billing/reconciliation.ts` |
| Checkout return | `src/features/billing/checkout-return.ts` |
| Account snapshot / usage | `src/features/billing/account-snapshot.ts`, `usage-metrics.ts` |
| Quota boundaries | `*-quota-boundary.ts`, `metered-reservation.ts` |
| Webhook route | `src/app/api/v1/clerk/billing/webhook/route.ts` |
| Reconcile route | `src/app/api/internal/maintenance/billing/reconcile-clerk/route.ts` |
| Fixture script | `scripts/db/apply-clerk-billing-fixture.ts` |
| Idempotency table | `supabase/schema/tables/clerk.ts` |

## Related docs

- [environment.md — Clerk development checkout](../development/environment.md#clerk-development-checkout-fixture-vs-real-payment-flow)
- [internal-worker-routes.md](./internal-worker-routes.md)
- [auth-and-data-layer.md](./auth-and-data-layer.md)
- [schema-overview.md](../database/schema-overview.md)
- [plan-generation-architecture.md](./plan-generation-architecture.md) (lesson generation quota)
