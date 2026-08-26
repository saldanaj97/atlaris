# Clerk Billing & Identity Architecture

**Audience:** Developers working on entitlements, pricing checkout, quotas, or billing webhooks.  
**Last Updated:** August 2026

Atlaris keeps a **single entitlement source**: Postgres `users` subscription columns projected from Clerk Billing webhooks and reconciliation. The same signed Clerk endpoint also maintains a minimal identity projection for the current, verified primary email. Do **not** gate features with Clerk `auth().has({ plan })` alongside DB tiers.

Local fixture mode, env checklists, and manual checkout verification live in [environment.md](../development/environment.md#clerk-development-checkout-fixture-vs-real-payment-flow). This page covers the runtime architecture.

## Flow overview

```text
Clerk Checkout / Dashboard / user lifecycle
        │
        ▼  Svix-signed events
POST /api/v1/clerk/billing/webhook
        │
        ├── insert clerk_webhook_events (idempotent on svix-id)
        ├── map billing event → ClerkBillingProjectionSource
        ├── optional billing refresh: clerkClient.billing.getUserBillingSubscription
        ├── map user event → ClerkUserProjectionSource
        └── UPDATE users (entitlements or verified primary email/tombstone)
                │
                ├── GET /api/v1/user/subscription  → Settings #billing / #usage
                └── quota boundaries (plans, regenerations, duration)
```

Drift repair (no webhook): `POST /api/internal/maintenance/billing/reconcile-clerk` when `CLERK_BILLING_RECONCILIATION_ENABLED=true`. See [internal-worker-routes.md](./internal-worker-routes.md).

## Webhook path

| Concern   | Detail                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Route     | `POST /api/v1/clerk/billing/webhook` → `src/app/api/v1/clerk/billing/webhook/route.ts`                                      |
| Auth      | IP rate limit (`webhook` bucket) → require `svix-id` → body ≤ 256 KiB → `verifyWebhook` with `CLERK_WEBHOOK_SIGNING_SECRET` |
| Apply     | `applyVerifiedClerkBillingEvent` in `src/features/billing/clerk-billing/reconciliation.ts`                                  |
| DB client | Service-role (no user session); signature verification is the trust boundary                                                |

### Event types

Prefix matching in `src/features/billing/clerk-billing/projection.ts`:

| Prefix                         | Handler                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `subscriptionItem.`            | Single subscription item                                            |
| `subscription.`                | All items on the subscription                                       |
| `paymentAttempt.`              | Items plus payment attempt status                                   |
| `user.created`, `user.updated` | Current exact verified primary email and Clerk update watermark     |
| `user.deleted`                 | Clear email and permanently tombstone the local identity projection |

Other types are ignored (`status: 'ignored'`). Subscribe the Clerk endpoint to `subscription.*`, `subscriptionItem.*`, `paymentAttempt.*`, `user.created`, `user.updated`, and `user.deleted`.

### Idempotency

Table `clerk_webhook_events` stores Svix delivery IDs (`event_id` unique). Duplicate inserts return `{ ok: true, status: 'duplicate' }` with HTTP 200 so Clerk does not retry forever. Rows older than 45 days are pruned by retention cleanup.

### Projection into `users`

Lookup: `users.auth_user_id` = Clerk payer user id (`user_...`).

| Column                    | Meaning                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `subscription_tier`       | `free` \| `starter` \| `pro`                                          |
| `subscription_status`     | `active` \| `canceled` \| `past_due` \| `trialing`                    |
| `subscription_period_end` | Period end timestamp                                                  |
| `cancel_at_period_end`    | Boolean                                                               |
| `email`                   | Exact Clerk primary email only while it is verified; otherwise `NULL` |
| `clerk_user_updated_at`   | Provider timestamp used to ignore stale lifecycle events              |
| `clerk_deleted_at`        | Permanent local tombstone for a Clerk `user.deleted` event            |

Plan slug → tier mapping lives in `src/features/billing/clerk-billing/plan-mapping.ts`. Slugs are the entitlement contract:

| Clerk plan slug | Atlaris tier |
| --------------- | ------------ |
| `free_user`     | `free`       |
| `starter_plan`  | `starter`    |
| `pro_plan`      | `pro`        |

Optional exact env IDs (`CLERK_BILLING_PLAN_ID_FREE` / `_STARTER` / `_PRO`) are a secondary match only when each ID maps to one tier. Never infer tier from price. Unknown slugs or ambiguous IDs leave the stored tier unchanged. Clerk Dashboard Features and Clerk `has()` / `Protect` are merchandising only — they are not a second authorization system. Dashboard plan/feature setup is ops, not a code commit.

Projection rules (highest paid tier, past-due retention, canceled-but-in-period, terminal downgrade to free, unknown-plan preservation) are implemented in `projectClerkBillingSource` — read that function before changing entitlement semantics.

Webhook applies refresh from Clerk Billing API (`refreshFromClerk: true`) before writing. Local fixtures call `applyClerkBillingSource` **without** refresh or webhook idempotency insert.

### Identity projection

The identity projection is intentionally narrow. `user.created` and `user.updated` use only Clerk's **exact** primary email when its verification status is `verified`; there is no fallback to another address. A missing or unverified primary address stores `NULL`. The provider's `updated_at` timestamp prevents stale deliveries from replacing newer data. A `user.deleted` event clears the email and sets `clerk_deleted_at`; later lifecycle updates cannot resurrect that row.

The event ledger acknowledges no-row `user.created` and `user.updated` events as `skipped_no_user`. A no-row `user.deleted` event is left unacknowledged so Clerk can retry it if provisioning races the deletion. On first authenticated use, Atlaris provisions the current Clerk identity instead. A unique-email conflict never transfers an address between local users; the transaction rolls back and Clerk retries the delivery.

For a deliberate one-shot repair after enabling lifecycle subscriptions, the command is dry-run by default:

```bash
# Local preview / apply
pnpm clerk:user:reconcile
pnpm clerk:user:reconcile -- --apply

# Hosted preview / apply (both explicit gates are required to mutate)
pnpm clerk:user:reconcile -- --allow-non-local true
pnpm clerk:user:reconcile -- --apply --allow-non-local true
```

It pages local `auth_user_id` values, obtains the current Clerk user, applies the same verified-primary projection, tombstones Clerk 404s, and exits nonzero if transient retrieval failures remain. Before an apply run, verify that `CLERK_SECRET_KEY` and `POSTGRES_URL` belong to the same target environment and review the dry-run `wouldTombstone` count. It is not a scheduler.

### Lifecycle cutover

1. Apply `20260811100100_add_clerk_user_identity_projection` in the migration workflow's expand phase.
2. Deploy the application release that handles the lifecycle events.
3. In the matching Clerk Dashboard instance, add `user.created`, `user.updated`, and `user.deleted` to the existing signed endpoint subscription.
4. Run the one-shot dry-run, inspect `wouldUpdate` and `wouldTombstone`, then use the explicit apply command only after the counts are expected.

Do not configure the lifecycle events against a different Clerk instance than the deployment's `CLERK_SECRET_KEY`; a mismatch makes current users appear deleted to the reconciliation command.

## Checkout return sync

When Clerk UI is enabled, `/pricing` builds a return URL:

```text
/settings?checkout=1&checkoutBaseline=<tier|status|periodEnd|cancelFlag>#billing
```

| Piece    | Source                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Baseline | `getOptionalCheckoutBillingSignature` / `buildCheckoutBillingSignature` in `src/features/billing/checkout-return*.ts` |
| UI       | `CheckoutSubscriptionSync` under Settings `#billing`                                                                  |
| Poll     | `GET /api/v1/user/subscription` every 2s for up to 30s                                                                |
| Done     | Current signature ≠ baseline → clear query params, `router.refresh()`                                                 |

Settings remains DB-backed. Manage/current-plan Clerk buttons live on `/pricing` (`ClerkPricingTable`), not in Settings.

### Pricing UI modes

| Mode          | Condition                                                            | UI                                          |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Clerk         | `shouldUseClerkUi()` true                                            | `ClerkPricingTable` (live plans / checkout) |
| Local preview | Local product testing (`LOCAL_PRODUCT_TESTING` + `DEV_AUTH_USER_ID`) | `LocalPricingPreview` — CTAs disabled       |

## Subscription API

`GET /api/v1/user/subscription` (`src/app/api/v1/user/subscription/route.ts`) returns tier, status, period end, cancel flag, and usage meters from `getBillingAccountSnapshot`. Auth via `requestBoundary.route` with read rate limit. Usage is `activePlans: { current, limit }` and `regenerations: { used, limit }`. Unlimited limits serialize as `null`. Lesson generation is not a product quota; `lessonGenerations` is not part of the contract. Exports are not part of the contract.

## Quotas and meters

Tier caps: `src/shared/constants/tier-limits.ts` (`TIER_LIMITS` for `free` / `starter` / `pro`).

| Cap                        | Enforcement                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Active plans               | `atomicCheckAndInsertPlan` / `countPlansContributingToCap`                                                                         |
| Lifetime Free initial plan | `initial_plan_generated_at` + namespace-1 admission lock; do not infer from `usage_metrics.plans_generated`                        |
| Plan duration (`maxWeeks`) | `checkPlanDurationCap` during creation and regeneration (no clamp)                                                                 |
| Monthly regenerations      | Free is not included (`PLAN_REGENERATION_NOT_INCLUDED`). Paid: `runRegenerationQuotaReserved` → `usage_metrics.regenerations_used` |
| Module lesson generation   | Request-rate limiter only. `usage_metrics.lesson_modules_generated` remains observational (do not drop).                           |
| AI model allowlist         | `validateModelForTier` / settings AI section                                                                                       |

Exports are not a product entitlement. Do not advertise, meter, or reserve them. `users.monthly_export_count` and `usage_metrics.exports_used` remain in the schema for compatibility only.

Metered reservation core: `src/features/billing/metered-reservation.ts`. Boundaries wrap reserve → work → compensate on failure. Month key is `YYYY-MM` on `usage_metrics`.

## Local / fixture tooling

| Command                                                             | Purpose                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm billing:clerk:fixture -- --user-id <auth_user_id> --plan pro` | Apply projection for a local user (localhost Postgres only unless `--allow-non-local true`)     |
| `pnpm clerk:user:reconcile -- --apply`                              | One-shot lifecycle projection repair; run only with the intended target environment credentials |
| `pnpm dev:local:starter`                                            | Start DB, seed, fixture starter, `pnpm dev`                                                     |
| `pnpm dev:local:pro`                                                | Same for pro                                                                                    |

### Pitfalls

1. Fixture mode **disables** Clerk UI — it does not exercise checkout or webhooks.
2. Do not mix `LOCAL_PRODUCT_TESTING=false` with a set `DEV_AUTH_USER_ID` (startup guard).
3. Fixture `--user-id` must match `users.auth_user_id` (seed id `00000000-0000-4000-8000-000000000001`).
4. Clerk Dashboard plan slugs must match `plan-mapping.ts` exactly (`free_user`, not `free`). Do not reuse one Clerk plan ID for Free and Starter. Optional env IDs are diagnostics, not portable keys.
5. Local webhook testing needs a public tunnel to `/api/v1/clerk/billing/webhook`.

## Settings surfaces

Single page `/settings` (`SettingsLedgerPage`):

| Hash       | Content                                        |
| ---------- | ---------------------------------------------- |
| `#billing` | Checkout sync + plan rows from DB snapshot     |
| `#usage`   | Active plans / regenerations meters            |
| `#ai`      | Model picker gated by `actor.subscriptionTier` |

## Code map

| Area                           | Path                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| Projection / plan mapping      | `src/features/billing/clerk-billing/`                               |
| Reconciliation + webhook apply | `src/features/billing/clerk-billing/reconciliation.ts`              |
| Checkout return                | `src/features/billing/checkout-return.ts`                           |
| Account snapshot / usage       | `src/features/billing/account-snapshot.ts`, `usage-metrics.ts`      |
| Quota boundaries               | `*-quota-boundary.ts`, `metered-reservation.ts`                     |
| Webhook route                  | `src/app/api/v1/clerk/billing/webhook/route.ts`                     |
| Reconcile route                | `src/app/api/internal/maintenance/billing/reconcile-clerk/route.ts` |
| Fixture script                 | `scripts/db/apply-clerk-billing-fixture.ts`                         |
| Idempotency table              | `supabase/schema/tables/clerk.ts`                                   |

## Related docs

- [environment.md — Clerk development checkout](../development/environment.md#clerk-development-checkout-fixture-vs-real-payment-flow)
- [internal-worker-routes.md](./internal-worker-routes.md)
- [auth-and-data-layer.md](./auth-and-data-layer.md)
- [schema-overview.md](../database/schema-overview.md)
- [plan-generation-architecture.md](./plan-generation-architecture.md) (module lesson generation pipeline)
