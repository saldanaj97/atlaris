# Environment Variables & Logging

Guidelines for environment variables and logging in this project.

## Environment Variables

### Core Rule

**All env access must go through `@/lib/config/env`.** Do **not** read `process.env` directly outside that module.

### Grouped Configs

Prefer the exported grouped configs instead of raw keys:

- `appEnv` - Runtime mode, app URL, maintenance mode
- `databaseEnv` - Database connection settings for Supabase Postgres
- `clerkAuthEnv` - Clerk publishable and secret keys
- `aiEnv` - AI/LLM provider configuration (includes `mockScenario` for mock provider)
- `aiTimeoutEnv` - AI generation timeout settings
- `openRouterEnv` - OpenRouter transport configuration
- `devAuthEnv` - Development auth overrides
- `localProductTestingEnv` - Local product-testing mode flag and deterministic seed user ids (allowed for local preview builds; refused in hosted deploys)
- `attemptsEnv` - Attempt cap overrides
- `regenerationQueueEnv` - Worker queue toggles and shared token
- `maintenanceEnv` - Manual maintenance controls and worker tokens, including the separate Vercel Cron `CRON_SECRET`
- `emailEnv` - Opted-in Resend delivery secrets (`RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_REPLY_TO`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`). `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` must be unpadded base64url encoding of at least 32 random bytes. Send enablement is the Vercel Flag `email-notification-delivery` (fail-closed). Keep the secret configured for the unsubscribe token lifetime even while delivery is disabled. Live delivery also requires production `APP_URL` (https) via `appEnv.url` for signed unsubscribe links and body deeplinks — set it before enabling the flag.
- `lessonContentEnv` - Module lesson generation kill-switch (`LESSON_GENERATION_ENABLED`; implemented in `src/lib/config/env/lesson-content.ts`)
- `workflowEnv` - Workflow SDK product flags (`MODULE_LESSON_WORKFLOW_ENABLED`, `PLAN_REGENERATION_WORKFLOW_ENABLED`, `PLAN_GENERATION_WORKFLOW_ENABLED`; implemented in `src/lib/config/env/workflow.ts`)
- `loggingEnv` - Logging, Sentry, and telemetry configuration

### Adding New Variables

If you need a new variable:

1. Add it to `src/lib/config/env.ts`
2. Include proper validation (using Zod)
3. Export it through the appropriate grouped config

### Auth Variables

The application uses Clerk Auth for UI, route protection, and server session reads.

Key auth-related server variables include:

| Variable                            | Purpose                                                                                                                               | Required |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser-safe publishable key                                                                                                    | Yes      |
| `CLERK_SECRET_KEY`                  | Clerk server secret key                                                                                                               | Yes      |
| `CLERK_WEBHOOK_SIGNING_SECRET`      | Clerk/Svix signing secret for `POST /api/v1/clerk/billing/webhook`                                                                    | Yes when Clerk Billing webhooks are enabled |
| `LOCAL_PRODUCT_TESTING`             | Enables the local product-testing workflow (must be off in hosted deploys). Do not combine with Clerk UI checkout — see [Clerk development checkout](#clerk-development-checkout-fixture-vs-real-payment-flow). | No       |
| `DEV_AUTH_USER_ID`                  | Optional dev/test auth override (`users.auth_user_id`); use bootstrap seed id for local DB. Required with `LOCAL_PRODUCT_TESTING=true`; must be empty for real Clerk checkout. | No       |
| `DEV_AUTH_USER_EMAIL`               | Optional dev/test display email                                                                                                       | No       |
| `DEV_AUTH_USER_NAME`                | Optional dev/test display name                                                                                                        | No       |
| `LESSON_GENERATION_ENABLED`         | `true`/`false`/`1`/`0`; when unset, defaults to **on** in development and **off** in other `NODE_ENV` values (see `lessonContentEnv`). Set `true` in hosted production/staging when module lesson generation should be live — see `docs/development/deploy.md`. | No (yes for hosted lesson generation) |

### Workflow SDK

**Source of truth for workflow env vars.** Configure feature flags in Vercel's Preview environment and use `pnpm deploy:preview` to exercise them remotely. Local UI development should leave workflow flags unset.

#### App-parsed product flags (`workflowEnv`)

Parsed in `src/lib/config/env/workflow.ts` via `workflowEnv`. All default **off** when unset or empty. These opt into durable workflow paths; they are not production defaults.

| Variable                             | Purpose                                                                                               | Required |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------- |
| `MODULE_LESSON_WORKFLOW_ENABLED`     | Routes `POST .../lesson-content/generate` through a durable workflow (HTTP 202 while in flight)       | No       |
| `PLAN_REGENERATION_WORKFLOW_ENABLED` | Routes regeneration enqueue and worker drain through a durable workflow                               | No       |
| `PLAN_GENERATION_WORKFLOW_ENABLED`   | Runs plan create/retry provider/finalization in a workflow after reservation; SSE transport unchanged | No       |
| `WORKFLOW_CALLBACK_TOKEN`            | Shared bearer token for non-Vercel workflow callback routes (`/.well-known/workflow/v1/flow`, `/step`). Not used on Vercel-hosted deploys (queue consumer security). | Yes on self-hosted production |

**Accepted values:** `true`, `false`, `1`, or `0` (case-insensitive). Any other value throws `EnvValidationError` at startup.

#### SDK-read variables (not parsed in app code)

| Variable             | Purpose                                                                                                                                                              | Required |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `WORKFLOW_SOURCEMAP` | Optional Workflow SDK source map mode (`inline`, `linked`, `external`, `both`, `false`, `0`, `1`). Read by Workflow SDK at build/runtime — do not parse in app code. | No       |

Runtime behavior, correlation fields, and disabling workflows: [Workflow SDK architecture](../architecture/workflow-sdk.md).

### Internal worker routes

Shared bearer tokens for scheduler-triggered POST routes under `/api/internal/`. See `docs/architecture/internal-worker-routes.md`.

| Variable                    | Purpose                                                            | Required in production                         |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| `REGENERATION_WORKER_TOKEN` | Auth for `POST /api/internal/jobs/regeneration/process`            | Yes                                            |
| `RETENTION_CLEANUP_ENABLED` | Master switch for the **manual** retention cleanup HTTP route only | Set `true` only when enabling the manual route |
| `PLAN_CLEANUP_ENABLED`      | Master switch for the plan cleanup HTTP route                        | Set `true` when scheduled cleanup is enabled |
| `CLERK_BILLING_RECONCILIATION_ENABLED` | Master switch for the manual Clerk Billing reconciliation route | Set `true` only when enabling manual reconciliation |
| `MAINTENANCE_WORKER_TOKEN`  | Auth for maintenance cleanup routes and the plan cleanup scheduler   | Yes when any maintenance route is enabled |
| `CRON_SECRET`               | Bearer auth for Vercel `GET /api/cron/notifications/email`; keep distinct from the maintenance token | Yes when email Vercel Cron is enabled |
| `WORKER_HEALTH_TOKEN`       | Auth for `GET /api/health/worker` operator metrics                   | Yes                                            |

Scheduled retention cleanup runs via Supabase Cron (`private.cleanup_retained_db_rows()`) and does not use these HTTP env vars. See `docs/architecture/retention-cleanup-runbook.md`.

Scheduled plan cleanup runs from `.github/workflows/plan-cleanup-scheduler.yml`. Configure the same `MAINTENANCE_WORKER_TOKEN` value in Vercel Production and the GitHub Actions repository secret.

Email notification delivery uses Vercel Cron and a durable Workflow SDK run. Set a separate `CRON_SECRET` in the Vercel environment; Vercel supplies it as the Bearer token for the cron GET route. Do not reuse `MAINTENANCE_WORKER_TOKEN`. The manual recovery route remains protected by `MAINTENANCE_WORKER_TOKEN`; see [the email delivery runbook](../architecture/email-notification-delivery-runbook.md).

Clerk Billing sends signed events to `POST /api/v1/clerk/billing/webhook` using `CLERK_WEBHOOK_SIGNING_SECRET`. Manual drift repair runs through `POST /api/internal/maintenance/billing/reconcile-clerk` when `CLERK_BILLING_RECONCILIATION_ENABLED=true`; the route processes up to 100 users and returns `nextCursor` for the next batch.

### Local product testing (development / test)

| Variable                | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `LOCAL_PRODUCT_TESTING` | Master flag for the seeded-user + mocks workflow (forbidden in hosted deploys)    |
| `MOCK_AI_SCENARIO`      | Mock AI: `success`, `timeout`, `provider_error`, `invalid_response`, `rate_limit` |

Clerk Billing local fixtures do not require Stripe app env vars. Use `pnpm billing:clerk:fixture -- --user-id <users.auth_user_id> --plan pro` to apply a local billing projection through the same service path as Clerk webhooks. Clerk Billing uses Stripe as the payment gateway, but Atlaris reads entitlement state from Clerk events and reconciliation.

**Fixture mode does not exercise checkout or webhooks.** It only updates the Postgres entitlement projection for local product testing.

Google Calendar is intentionally not implemented right now. The settings page keeps a static `Coming Soon` placeholder so the product surface remains visible without implying a partial OAuth flow.

### Clerk development checkout (fixture vs real payment flow)

Atlaris keeps a single entitlement source: the Postgres `users` projection updated from Clerk Billing webhooks/reconciliation. Do not add Clerk `auth().has({ plan })` checks alongside DB tiers.

Startup fails in development when Clerk UI would be enabled while `DEV_AUTH_USER_ID` is also set (`LOCAL_PRODUCT_TESTING=false` + non-empty `DEV_AUTH_USER_ID`). Choose exactly one mode:

| Mode | Env contract | What it proves |
| ---- | ------------ | -------------- |
| **Fixture / local product testing** | `LOCAL_PRODUCT_TESTING=true`, `DEV_AUTH_USER_ID` = seeded `users.auth_user_id` | DB entitlements and quota UI via `pnpm billing:clerk:fixture`, `pnpm dev:local:starter`, `pnpm dev:local:pro`. **Does not** test Clerk checkout or webhooks. |
| **Real Clerk development checkout** | `LOCAL_PRODUCT_TESTING=false` (or unset), `DEV_AUTH_USER_ID` unset/empty, Clerk **test** keys for one Development instance, usable `CLERK_WEBHOOK_SIGNING_SECRET` | Checkout → Clerk webhook → Postgres projection → Atlaris quota. |

#### Clerk Dashboard contract (same Development instance)

- Plans for Users must use exact slugs mapped in `src/features/billing/clerk-billing/plan-mapping.ts`:
  - `free_user` → `free`
  - `starter_plan` → `starter`
  - `pro_plan` → `pro`
- Do not use a generic `pro` Clerk plan slug.
- Dashboard plan features/limits should match `src/shared/constants/tier-limits.ts` (link the source; do not copy values into docs where drift is likely).
- Webhook endpoint: `{APP_URL}/api/v1/clerk/billing/webhook`, subscribed to `subscription.*`, `subscriptionItem.*`, and `paymentAttempt.*`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET` must all belong to that same Development instance. Presence of an encrypted Vercel variable is not proof the value matches the endpoint.
- Prefer hosted Preview/staging for real checkout. Localhost needs a public tunnel to the webhook path ([Clerk webhook debugging](https://clerk.com/docs/guides/development/webhooks/debugging)).
- Clerk’s shared development payment gateway uses Stripe test cards ([Stripe testing](https://docs.stripe.com/testing)). **No app-owned Stripe account, Stripe API keys, Stripe products, or Stripe prices are required.**
- Never commit Clerk keys or webhook secrets.

After a successful `PricingTable` checkout, Clerk redirects to `/settings?checkout=1#billing`. Settings shows a bounded “Updating your subscription…” state while the webhook projection catches up, then refreshes the DB-backed rows. Settings remains the DB-backed account and entitlement surface.

#### Manual real-checkout verification (opt-in; not default CI)

Reuse this checklist for Preview/staging or a tunneled local run. Do not put real payment tests in the default CI suite. Complements the Clerk Billing deployment smoke intent (JCS-37); do not maintain a second competing checklist elsewhere.

1. `/pricing` renders the publicly available Clerk user plans (`free_user`, `starter_plan`, `pro_plan`).
2. Checkout succeeds with `4242 4242 4242 4242`, a future expiry, any valid CVC, and any valid postal code.
3. A decline path (for example `4000 0000 0000 0002`) shows a recoverable error.
4. Abandoning checkout leaves the current entitlement unchanged.
5. Clerk Dashboard shows the subscription/payment attempt and webhook delivery.
6. `POST /api/v1/clerk/billing/webhook` acknowledges the event and does not retry endlessly.
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
- `src/lib/config/env.ts` - Environment variable definitions and validation
- `src/lib/logging/logger.ts` - Server-side Pino structured logging
- `src/lib/logging/client.ts` - Client-side console wrapper
- `src/lib/logging/request-context.ts` - Request context helpers for API routes
