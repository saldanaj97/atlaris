# Environment Variables & Logging

Guidelines for environment variables and logging in this project.

## Environment Variables

### Core Rule

**All env access must go through a module under `@/lib/config/env`.** Do **not** read `process.env` directly outside that directory. Import stable shared exports from `@/lib/config/env`; import a facet directly when it is intentionally not part of that compatibility barrel.

### Hosted runtime profile

Every Vercel Preview, Staging, and Production deployment must run with `NODE_ENV=production`. Startup refuses a hosted process with missing, blank, development, or test `NODE_ENV`, or with `VITEST_WORKER_ID`, `DEV_AUTH_USER_ID`, or enabled `LOCAL_PRODUCT_TESTING`. These capability markers remain valid for local development and tests only.

### Grouped Configs

Prefer the exported grouped configs instead of raw keys:

- `appEnv` - Runtime mode, app URL, maintenance mode (`MAINTENANCE_MODE` env hard-on; combines with the `maintenance-mode` Vercel Flag — see [Vercel Flags](#vercel-flags))
- `databaseEnv` - Database connection settings for Supabase Postgres
- `clerkAuthEnv` - Clerk publishable and secret keys
- `aiEnv` - AI/LLM provider configuration (includes `mockScenario` for mock provider)
- `aiTimeoutEnv` - AI generation timeout settings
- `openRouterEnv` - OpenRouter transport configuration
- `devAuthEnv` - Development auth overrides
- `localProductTestingEnv` - Local product-testing mode flag and deterministic seed user ids (allowed for local preview builds; refused in hosted deploys)
- `getAttemptCap` - Attempt cap overrides (implemented in `src/lib/config/env/ai.ts`)
- `regenerationQueueEnv` - Worker queue toggles and shared token
- `maintenanceEnv` - Manual maintenance controls and worker tokens, including the separate Vercel Cron `CRON_SECRET`
- `emailEnv` - Opted-in Resend delivery secrets (`RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_REPLY_TO`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`). `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` must be unpadded base64url encoding of at least 32 random bytes. Send enablement is the Vercel Flag `email-notification-delivery` (fail-closed). Keep the secret configured for the unsubscribe token lifetime even while delivery is disabled. Live delivery also requires production `APP_URL` (https) via `appEnv.url` for signed unsubscribe links and body deeplinks — set it before enabling the flag.
- Module lesson generation kill-switch is the Vercel Flag `module-lesson-generation` (fail-closed; declared in `src/flags.ts`, resolved via `src/features/lesson-content/generation-flag.ts`).
- Workflow SDK product paths are permanently enabled; `WORKFLOW_CALLBACK_TOKEN` remains the only app configuration for self-hosted callback access.
- `loggingEnv` - Logging, Sentry, and telemetry configuration

### Vercel Flags

Runtime feature gates use the Flags SDK (`src/flags.ts`) with `@flags-sdk/vercel` when `FLAGS` is set. These are distinct from the permanently enabled Workflow SDK product paths.

| Variable       | Purpose                                                                                                                                                        | Required                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `FLAGS`        | Enables the Vercel Flags adapter (`vercelAdapter()`). When unset, flags resolve through a local fallback that returns each flag's `defaultValue` (or `false`). | Preview/Production when using Vercel Flags |
| `FLAGS_SECRET` | Flags Explorer / encryption secret for the Vercel Flags integration                                                                                            | Preview/Production when using Vercel Flags |

Declared flags:

| Flag key                      | Code export                 | Default / failure mode                                                                                                                                               | Combines with                                                                                               |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `maintenance-mode`            | `maintenanceMode`           | No `defaultValue` on the flag; evaluation errors **fail open** (site stays available) via `resolveEffectiveMaintenanceMode()` in `src/lib/proxy/maintenance-mode.ts` | `MAINTENANCE_MODE` env (`appEnv.maintenanceMode`) — env `true` forces maintenance on regardless of the flag |
| `email-notification-delivery` | `emailNotificationDelivery` | `defaultValue: false`; evaluation errors **fail closed** via `resolveEmailNotificationDeliveryEnabled()` in `src/features/notifications/email/delivery-flag.ts`      | Resend + production `APP_URL` (see `emailEnv`)                                                              |
| `module-lesson-generation`    | `moduleLessonGeneration`    | `defaultValue: false`; evaluation errors **fail closed** via `resolveModuleLessonGenerationEnabled()` in `src/features/lesson-content/generation-flag.ts`            | Synchronous and Workflow SDK module lesson generation                                                       |

**Local without `FLAGS`:** all flags resolve to their fallback (`defaultValue ?? false`), so email delivery and lesson generation stay off; maintenance stays off unless `MAINTENANCE_MODE=true`.

**Maintenance bypass paths** (still reachable while maintenance is on) are listed in `src/lib/proxy/middleware-policy.ts`, including `GET /api/cron/notifications/email`, `GET /api/health/worker`, and the signed unsubscribe route. Ops for email delivery: [Email notification delivery runbook](../architecture/email-notification-delivery-runbook.md).

Hosted templates list `FLAGS` / `FLAGS_SECRET` in `.env.preview.example` and `.env.production.example`. Production also documents `MAINTENANCE_MODE`.

### Flag and gate ownership

Operational kill switches stay in Vercel Flags. Deployment, maintenance, privacy, observability, local-test, secret, and capacity controls stay environment configuration. Future user-, cohort-, anonymous-visitor-, percentage-rollout-, and experiment-driven product behavior belongs in PostHog. Do **not** add `@flags-sdk/posthog` or create PostHog flags for the three operational switches in the [Vercel Flags](#vercel-flags) table. No currently active Atlaris flag moves to PostHog.

`src/flags.ts` is the only Flags SDK declaration file. Flags Explorer discovery is `src/app/.well-known/vercel/flags/route.ts` (`getProviderData` of that module only). Preference Settings opt-ins are not flags — see [user-preferences.md](../architecture/user-preferences.md).

`MAINTENANCE_MODE` is an independent env hard-on (`appEnv.maintenanceMode`). Env `true` forces maintenance on without evaluating `maintenance-mode`.

#### Deployment and maintenance gates (owner × runtime)

The three Flags above are the only Flags SDK keys. Everything in this table is env, scheduler, or database cron — not a Flags SDK flag and not a PostHog flag.

| Control                                                                                          | Owner                                                                                         | Runtime                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAINTENANCE_MODE`                                                                               | Vercel env (`appEnv`)                                                                         | Proxy hard-on; short-circuits `maintenance-mode` evaluation                                                                                                                                                                      |
| `FLAGS` / `FLAGS_SECRET`                                                                         | Vercel env                                                                                    | Enables `vercelAdapter()` and Flags Explorer; unset uses each flag's local fallback                                                                                                                                              |
| `REGENERATION_QUEUE_ENABLED` + `REGENERATION_WORKER_TOKEN`                                       | Vercel env (`regenerationQueueEnv`) + GitHub Actions repo var / `Production – atlaris` secret | HTTP `POST /api/internal/jobs/regeneration/process`. Scheduled by `.github/workflows/regeneration-worker-scheduler.yml` every 15 minutes when the repo var is `true`; manual dispatch bypasses that gate                         |
| `PLAN_CLEANUP_ENABLED` + `MAINTENANCE_WORKER_TOKEN`                                              | Vercel env (`maintenanceEnv`) + GitHub Actions repo var / `Production – atlaris` secret       | HTTP `POST /api/internal/maintenance/plans/cleanup`. Scheduled by `.github/workflows/plan-cleanup-scheduler.yml` every 15 minutes when the repo var is `true`; manual dispatch bypasses that gate                                |
| `RETENTION_CLEANUP_ENABLED` + `MAINTENANCE_WORKER_TOKEN`                                         | Vercel env (`maintenanceEnv`)                                                                 | Manual HTTP `POST /api/internal/maintenance/retention/cleanup` only                                                                                                                                                              |
| `private.cleanup_retained_db_rows()`                                                             | Supabase Cron job `retention-cleanup`                                                         | Daily database cleanup; does not read the HTTP env vars. See [retention-cleanup-runbook.md](../architecture/retention-cleanup-runbook.md)                                                                                        |
| `CLERK_BILLING_RECONCILIATION_ENABLED` + `MAINTENANCE_WORKER_TOKEN`                              | Vercel env (`maintenanceEnv`)                                                                 | Manual HTTP `POST /api/internal/maintenance/billing/reconcile-clerk`                                                                                                                                                             |
| `CRON_SECRET`                                                                                    | Vercel env (`maintenanceEnv.cronSecret`)                                                      | Vercel Cron `GET /api/cron/notifications/email`; keep distinct from `MAINTENANCE_WORKER_TOKEN`                                                                                                                                   |
| `WORKER_HEALTH_TOKEN`                                                                            | Vercel env (`maintenanceEnv`)                                                                 | `GET /api/health/worker`                                                                                                                                                                                                         |

Route auth and enablement contract: [internal-worker-routes.md](../architecture/internal-worker-routes.md). Env facets for privacy, observability, local-test, secrets, and capacity (`loggingEnv` / Sentry, Clerk / Resend / OpenRouter, `LOCAL_PRODUCT_TESTING`, AI attempt caps) stay in `@/lib/config/env` and are not Flags SDK keys.

#### Stale remote flag (`landing-hero-experiment`)

Code has zero callers of `landing-hero-experiment`. The marketing hero is `src/app/(marketing)/landing/components/HeroSection.tsx` and is not flag-gated. Archive or delete the remote Vercel flag only after Juan confirms it is unused in the live dashboard. This documentation change does not archive the remote flag or change live kill-switch values.

#### PostHog

PostHog is analytics ingest today (`posthog-js`, `posthog-node`, application-owned `/ingest` proxy). Project `551450` had zero active flags when audited on September 2, 2026. Reserve PostHog for future product experiments and cohort rollouts. Do not wire a PostHog Flags adapter for `maintenance-mode`, `email-notification-delivery`, or `module-lesson-generation`.

### Adding New Variables

If you need a new variable:

1. Add it to the owning facet under `src/lib/config/env/`.
2. Include proper validation (using Zod)
3. Re-export it from `src/lib/config/env.ts` only when it is a stable shared config; otherwise keep the direct facet import and document it here.

### Auth Variables

The application uses Clerk Auth for UI, route protection, and server session reads.

**Clerk UI delivery:** Auth and billing UI load from Clerk’s CDN through the default `@clerk/nextjs` `ClerkProvider` path (`src/app/layout.tsx`). The app does **not** pin or bundle `@clerk/ui`. CSP allows Clerk Frontend API scripts via `https://*.clerk.accounts.dev` in `src/lib/proxy/security-headers.ts`. If sign-in, UserButton, or pricing UI fails to load, check that CSP allowlist and network access to Clerk accounts hosts before assuming an app bug. Appearance and localization still come from Atlaris props on `ClerkProvider`.

Key auth-related server variables include:

| Variable                            | Purpose                                                                                                                                                                                                         | Required                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser-safe publishable key                                                                                                                                                                              | Yes                                         |
| `CLERK_SECRET_KEY`                  | Clerk server secret key                                                                                                                                                                                         | Yes                                         |
| `CLERK_WEBHOOK_SIGNING_SECRET`      | Clerk/Svix signing secret for `POST /api/v1/clerk/billing/webhook`                                                                                                                                              | Yes when Clerk Billing webhooks are enabled |
| `CLERK_BILLING_PLAN_ID_FREE`        | Optional exact Clerk plan ID for Free; secondary match only. Slug `free_user` is authoritative.                                                                                                                 | No                                          |
| `CLERK_BILLING_PLAN_ID_STARTER`     | Optional exact Clerk plan ID for Starter; secondary match only. Slug `starter_plan` is authoritative.                                                                                                           | No                                          |
| `CLERK_BILLING_PLAN_ID_PRO`         | Optional exact Clerk plan ID for Pro; secondary match only. Slug `pro_plan` is authoritative.                                                                                                                   | No                                          |
| `LOCAL_PRODUCT_TESTING`             | Enables the local product-testing workflow (must be off in hosted deploys). Do not combine with Clerk UI checkout — see [Clerk development checkout](#clerk-development-checkout-fixture-vs-real-payment-flow). | No                                          |
| `DEV_AUTH_USER_ID`                  | Optional dev/test auth override (`users.auth_user_id`); use bootstrap seed id for local DB. Required with `LOCAL_PRODUCT_TESTING=true`; must be empty for real Clerk checkout.                                  | No                                          |
| `DEV_AUTH_USER_EMAIL`               | Optional dev/test display email                                                                                                                                                                                 | No                                          |
| `DEV_AUTH_USER_NAME`                | Optional dev/test display name                                                                                                                                                                                  | No                                          |

Module lesson generation enablement is the Vercel Flag `module-lesson-generation` (fail-closed / default disabled). See `docs/development/deploy.md`.

### Workflow SDK

Module lesson generation still uses the separate fail-closed Vercel Flag `module-lesson-generation`. Its durable workflow, plan regeneration, and plan create/retry are permanently enabled. Use `pnpm deploy:preview` to exercise them remotely.

#### App configuration

| Variable                  | Purpose                                                                                                                                                              | Required                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `WORKFLOW_CALLBACK_TOKEN` | Shared bearer token for non-Vercel workflow callback routes (`/.well-known/workflow/v1/flow`, `/step`). Not used on Vercel-hosted deploys (queue consumer security). | Yes on self-hosted production |

#### SDK-read variables (not parsed in app code)

| Variable             | Purpose                                                                                                                                                              | Required |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `WORKFLOW_SOURCEMAP` | Optional Workflow SDK source map mode (`inline`, `linked`, `external`, `both`, `false`, `0`, `1`). Read by Workflow SDK at build/runtime — do not parse in app code. | No       |

Runtime behavior and correlation fields: [Workflow SDK architecture](../architecture/workflow-sdk.md).

### Internal worker routes

Shared bearer tokens for scheduler-triggered POST routes under `/api/internal/`. See `docs/architecture/internal-worker-routes.md`.

| Variable                               | Purpose                                                                                              | Required in production                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `REGENERATION_WORKER_TOKEN`            | Auth for `POST /api/internal/jobs/regeneration/process`                                              | Yes                                                 |
| `RETENTION_CLEANUP_ENABLED`            | Master switch for the **manual** retention cleanup HTTP route only                                   | Set `true` only when enabling the manual route      |
| `PLAN_CLEANUP_ENABLED`                 | Master switch for the plan cleanup HTTP route                                                        | Set `true` when scheduled cleanup is enabled        |
| `CLERK_BILLING_RECONCILIATION_ENABLED` | Master switch for the manual Clerk Billing reconciliation route                                      | Set `true` only when enabling manual reconciliation |
| `MAINTENANCE_WORKER_TOKEN`             | Auth for maintenance cleanup routes and the plan cleanup scheduler                                   | Yes when any maintenance route is enabled           |
| `CRON_SECRET`                          | Bearer auth for Vercel `GET /api/cron/notifications/email`; keep distinct from the maintenance token | Yes when email Vercel Cron is enabled               |
| `WORKER_HEALTH_TOKEN`                  | Auth for `GET /api/health/worker` operator metrics                                                   | Yes                                                 |

Scheduled retention cleanup runs via Supabase Cron (`private.cleanup_retained_db_rows()`) and does not use these HTTP env vars. See `docs/architecture/retention-cleanup-runbook.md`.

Scheduled plan regeneration runs from `.github/workflows/regeneration-worker-scheduler.yml` every 15 minutes when its `REGENERATION_QUEUE_ENABLED` repository variable is `true`. Configure the same `REGENERATION_WORKER_TOKEN` value in the production deployment and the GitHub Actions `Production – atlaris` environment secret; manual dispatch bypasses the repository-variable gate.

Scheduled plan cleanup runs from `.github/workflows/plan-cleanup-scheduler.yml`. Configure the same `MAINTENANCE_WORKER_TOKEN` value in Vercel Production and the GitHub Actions `Production – atlaris` environment secret.

Email notification delivery uses Vercel Cron and a durable Workflow SDK run. Set a separate `CRON_SECRET` in the Vercel environment; Vercel supplies it as the Bearer token for the cron GET route. Do not reuse `MAINTENANCE_WORKER_TOKEN`. The manual recovery route remains protected by `MAINTENANCE_WORKER_TOKEN`; see [the email delivery runbook](../architecture/email-notification-delivery-runbook.md).

Clerk Billing sends signed events to `POST /api/v1/clerk/billing/webhook` using `CLERK_WEBHOOK_SIGNING_SECRET`. Manual drift repair runs through `POST /api/internal/maintenance/billing/reconcile-clerk` when `CLERK_BILLING_RECONCILIATION_ENABLED=true`; the route processes up to 100 users and returns `nextCursor` for the next batch. Architecture (projection, quotas, checkout sync): [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md).

### Vercel Flags (`src/flags.ts`)

Canonical table (env vars, fail-open/closed behavior, and local fallback): [Vercel Flags](#vercel-flags) above. Ownership (Vercel Flags vs env vs PostHog) and the deployment/maintenance inventory: [Flag and gate ownership](#flag-and-gate-ownership). Preference Settings are separate from these kill switches — see [user-preferences.md](../architecture/user-preferences.md).

### Local product testing (development / test)

| Variable                | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `LOCAL_PRODUCT_TESTING` | Master flag for the seeded-user + mocks workflow (forbidden in hosted deploys)    |
| `MOCK_AI_SCENARIO`      | Mock AI: `success`, `timeout`, `provider_error`, `invalid_response`, `rate_limit` |

Clerk Billing local fixtures do not require Stripe app env vars. Use `pnpm billing:clerk:fixture -- --user-id <users.auth_user_id> --plan pro` to apply a local billing projection through the same service path as Clerk webhooks. Clerk Billing uses Stripe as the payment gateway, but Atlaris reads entitlement state from Clerk events and reconciliation.

**Fixture mode does not exercise checkout or webhooks.** It only updates the Postgres entitlement projection for local product testing.

Google Calendar is intentionally not implemented right now. The settings page keeps a static `Coming Soon` placeholder so the product surface remains visible without implying a partial OAuth flow.

### Clerk development checkout (fixture vs real payment flow)

Atlaris keeps a single entitlement source: the Postgres `users` projection updated from Clerk Billing webhooks/reconciliation. Do not add Clerk `auth().has({ plan })` checks alongside DB tiers. For webhook → projection → quota details, see [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md).

Startup fails in development when Clerk UI would be enabled while `DEV_AUTH_USER_ID` is also set (`LOCAL_PRODUCT_TESTING=false` + non-empty `DEV_AUTH_USER_ID`). Choose exactly one mode:

| Mode                                | Env contract                                                                                                                                                      | What it proves                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fixture / local product testing** | `LOCAL_PRODUCT_TESTING=true`, `DEV_AUTH_USER_ID` = seeded `users.auth_user_id`                                                                                    | DB entitlements and quota UI via `pnpm billing:clerk:fixture`, `pnpm dev:local:starter`, `pnpm dev:local:pro`. **Does not** test Clerk checkout or webhooks. |
| **Real Clerk development checkout** | `LOCAL_PRODUCT_TESTING=false` (or unset), `DEV_AUTH_USER_ID` unset/empty, Clerk **test** keys for one Development instance, usable `CLERK_WEBHOOK_SIGNING_SECRET` | Checkout → Clerk webhook → Postgres projection → Atlaris quota.                                                                                              |

**Fixture mode and Clerk UI:** When local product testing is on, `shouldUseClerkUi()` in `src/lib/auth/local-identity.ts` returns `false`. Root layout skips `ClerkProvider`, so sign-in modals, UserButton, and Clerk Billing components do not mount. `/pricing` still renders After Hours plan cards through `LocalPricingPreview` (representative prices; every CTA is “Preview only” / disabled). Use real Clerk development checkout mode to exercise live pricing checkout.

#### Clerk Dashboard contract (same Development instance)

- Plans for Users must use exact slugs mapped in `src/features/billing/clerk-billing/plan-mapping.ts`:
  - `free_user` → `free`
  - `starter_plan` → `starter`
  - `pro_plan` → `pro`
- Do not use a generic `pro` Clerk plan slug.
- Never reuse one Clerk plan ID for Free and Starter. Mapping never infers tier from price. Unknown slugs preserve the stored Atlaris tier.
- Optional `CLERK_BILLING_PLAN_ID_*` env vars are environment-specific diagnostics, not portable entitlement keys.
- Dashboard plan features are merchandising copy for PricingTable. Runtime enforcement stays in `TIER_LIMITS` and server policies. Do not add Clerk `has()` / `Protect` checks.
- Dashboard plan features/limits should match `src/shared/constants/tier-limits.ts` (link the source; do not copy values into docs where drift is likely).
- Webhook endpoint: `{APP_URL}/api/v1/clerk/billing/webhook`, subscribed to `subscription.*`, `subscriptionItem.*`, `paymentAttempt.*`, `user.created`, `user.updated`, and `user.deleted`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET` must all belong to that same Development instance. Presence of an encrypted Vercel variable is not proof the value matches the endpoint.
- Prefer hosted Preview/staging for real checkout. Localhost needs a public tunnel to the webhook path ([Clerk webhook debugging](https://clerk.com/docs/guides/development/webhooks/debugging)).
- Clerk’s shared development payment gateway uses Stripe test cards ([Stripe testing](https://docs.stripe.com/testing)). **No app-owned Stripe account, Stripe API keys, Stripe products, or Stripe prices are required.**
- Never commit Clerk keys or webhook secrets.

Before checkout, `/pricing` adds the signed-in user's current billing signature to Clerk's `/settings?checkout=1&checkoutBaseline=...#billing` return URL. Settings compares that short-lived UI-only baseline with the DB-backed subscription API, shows a bounded “Updating your subscription…” state while the webhook projection catches up, then removes both query markers and refreshes the rows. Settings remains the DB-backed account and entitlement surface.

#### Manual real-checkout verification (opt-in; not default CI)

Reuse this checklist for Preview/staging or a tunneled local run. Do not put real payment tests in the default CI suite. Complements the Clerk Billing deployment smoke intent (JCS-37); do not maintain a second competing checklist elsewhere.

1. `/pricing` renders the publicly available Clerk user plans (`free_user`, `starter_plan`, `pro_plan`).
2. Checkout succeeds with `4242 4242 4242 4242`, a future expiry, any valid CVC, and any valid postal code.
3. A decline path (for example `4000 0000 0000 0002`) shows a recoverable error.
4. Abandoning checkout leaves the current entitlement unchanged.
5. Clerk Dashboard shows the subscription/payment attempt and webhook delivery.
6. `POST /api/v1/clerk/billing/webhook` acknowledges completed events. A concurrent delivery may receive a temporary `503` with `Retry-After` while another request owns the two-minute processing claim; Clerk should retry that delivery, and completed duplicates return `200` without another Clerk refresh.
7. The correct `users.auth_user_id` receives updated `subscription_tier`, `subscription_status`, `subscription_period_end`, and `cancel_at_period_end`.
8. Settings (`?checkout=1` sync UI, then settled rows) and at least one quota/feature boundary reflect the upgraded tier.
9. Cancellation or cancel-at-period-end behavior is verified in Clerk and in the Postgres projection.

Record evidence without secrets: environment name, Clerk Development instance name/ID, test user email/id, selected plan slug, webhook event ID + delivery outcome, resulting DB tier/status, settings/quota observation, and any sync timeout/retry behavior.

### Local Supabase database

Use `pnpm db:dev:start` to start the Supabase local stack, then copy the current local URL and keys from `supabase status`.

| Variable                               | Local default / source                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `POSTGRES_URL`                         | `postgresql://postgres:postgres@127.0.0.1:54322/postgres`                |
| `NEXT_PUBLIC_SUPABASE_URL`             | `http://127.0.0.1:54321`                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key from `supabase status`                            |
| `SUPABASE_SERVICE_ROLE_KEY`            | Service role key from `supabase status`; never expose to browser clients |

Only add `POSTGRES_URL_NON_POOLING` locally when a command needs a direct/session URL for DDL; set it to the same local `POSTGRES_URL` for Supabase local.

### Cloud agents (1Password Environments)

Codex / Cursor cloud agents can materialize `.env.local` from a 1Password Environment via `scripts/agents/codex-1password-env.sh`. Required cloud secrets: `OP_ENVIRONMENT_ID`, `OP_SERVICE_ACCOUNT_TOKEN`. This path is separate from Vercel hosted env templates. Full steps and overwrite rules: [1Password agents setup](../third-party-services/1password-agents-setup.md). Seeded shape reference: `.env.agents.example`.

## Logging

### Critical Rule: Server vs Client

The codebase uses a **dual-logger architecture**:

| Environment | Import Path            | Use In                                                         |
| ----------- | ---------------------- | -------------------------------------------------------------- |
| **Server**  | `@/lib/logging/logger` | API routes, server components, server actions                  |
| **Client**  | `@/lib/logging/client` | Client components with `'use client'`, hooks, error boundaries |

**Never mix them.** Client components (`'use client'`) must NOT import `@/lib/logging/logger`. See the full logging architecture guide at `docs/development/logging.md`.

### Quick Reference

#### Server-Side Logging

```typescript
import { logger } from '@/lib/logging/logger';

// Basic logging
logger.info('User created plan', { userId, planId });
logger.error('Database connection failed', { error });
```

#### API Routes with Request Context

```typescript
import { getRequestContext } from '@/lib/logging/request-context';

export async function POST(request: Request) {
  const { requestId, logger } = getRequestContext(request);

  logger.info('Creating new plan', { userId });
  // All logs will include requestId automatically
}
```

#### Client-Side Logging

```typescript
'use client';

import { clientLogger } from '@/lib/logging/client';

export function MyClientComponent() {
  useEffect(() => {
    clientLogger.info('Component mounted');
  }, []);

  const handleError = (error: Error) => {
    clientLogger.error('Operation failed:', { error });
  };
}
```

#### Error Boundaries

Error boundaries are always client components:

```typescript
'use client';

import { clientLogger } from '@/lib/logging/client';
import { useEffect } from 'react';

export default function MyErrorBoundary({ error }: { error: Error }) {
  useEffect(() => {
    clientLogger.error('Error caught:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return <div>Error occurred</div>;
}
```

### When to Use Console

If you think you need a direct `console.*` call, consider updating the centralized logging utilities in `@/lib/logging/` instead. The only exceptions are:

- Scripts and CLI tools
- Test output (test utilities may use console)

## Related Files

- `docs/development/logging.md` - Comprehensive logging architecture guide
- `docs/third-party-services/1password-agents-setup.md` - Cloud agent env bootstrap from 1Password
- `docs/architecture/email-notification-delivery-runbook.md` - Email delivery ops + preference model
- `src/flags.ts` - Vercel Flags declarations
- `src/lib/config/env.ts` - Stable environment-config compatibility barrel; facet modules under `src/lib/config/env/` own definitions and validation
- `src/lib/logging/logger.ts` - Server-side Pino structured logging
- `src/lib/logging/client.ts` - Client-side console wrapper
- `src/lib/logging/request-context.ts` - Request context helpers for API routes
