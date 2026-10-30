# Environment Variables & Logging

Guidelines for environment variables and logging in this project.

## Environment Variables

### Core Rule

**All env access must go through a module under `@/lib/config/env`.** Do **not** read `process.env` directly outside that directory. Import stable shared exports from `@/lib/config/env`; import a facet directly when it is intentionally not part of that compatibility barrel.

### Hosted runtime profile

Every Vercel Preview, Staging, and Production deployment must run with `NODE_ENV=production`. Startup refuses a hosted process with missing, blank, development, or test `NODE_ENV`, or with `VITEST_WORKER_ID`, `DEV_AUTH_USER_ID`, or enabled `LOCAL_PRODUCT_TESTING`. These capability markers remain valid for local development and tests only.

### Grouped Configs

Prefer the exported grouped configs instead of raw keys:

- `appEnv` - Runtime mode, app URL, and the `MAINTENANCE_MODE` and `LAUNCH_WAITLIST` fail-safes (used only if the `maintenance-mode` or `launch-waitlist` flag fails to evaluate — see [Feature flags](#feature-flags-cloudflare-flagship))
- `databaseEnv` - Database connection settings for Supabase Postgres
- `clerkAuthEnv` - Clerk publishable and secret keys
- `aiEnv` - AI/LLM provider configuration (includes `mockScenario` for mock provider)
- `aiTimeoutEnv` - AI generation timeout settings: `AI_TIMEOUT_BASE_MS` (default 120 s), `AI_TIMEOUT_EXTENSION_MS`, `AI_TIMEOUT_EXTENSION_THRESHOLD_MS`, and `AI_LESSON_TIMEOUT_MS` (default 300 s), which replaces the base for lesson-writing calls (the module batch and the grounded writer) and sizes their Workflow steps
- `openRouterEnv` - OpenRouter transport configuration and the required preset slugs `OPENROUTER_PLAN_PRESET` and `OPENROUTER_LESSON_PRESET`. The plan and lesson system prompts live only in those OpenRouter presets (the repo has no fallback copy), so a real provider call without a valid slug fails before any request is sent. The mock provider needs neither. Optional `OPENROUTER_BASE_URL` (a Cloudflare AI Gateway `/openrouter` URL) and `CF_AI_GATEWAY_TOKEN` route calls through AI Gateway; the provider sends `cf-aig-*` headers (token, `stage`/`preset` metadata, cache skip, one retry) only to `gateway.ai.cloudflare.com`. Gateway logs keep prompt and response bodies only when `WORKER_ENV` is `staging` or `development`. Optional `OPENROUTER_API_KEY_FREE`, `OPENROUTER_API_KEY_STARTER` and `OPENROUTER_API_KEY_PRO` are per-tier keys (`openRouterEnv.apiKeyForTier`), each falling back to `OPENROUTER_API_KEY`; only grounded stages pass a tier, so the current pipeline always uses `OPENROUTER_API_KEY`. The same tier keys, read strictly with no fallback (`openRouterEnv.guardrailKeyForTier`), sync each tier's selectable models from its OpenRouter guardrail; a runtime without a tier's key reads that tier's last synced models and never syncs it (see `docs/ai/available-models.md`).
- `parallelEnv` - `PARALLEL_API_KEY`, the Parallel Search API key for direct plan research (DEV-171). Only the jobs Worker reads it, and only while its `PARALLEL_DIRECT_RESEARCH` switch is on; the app never calls Parallel.
- `devAuthEnv` - Development auth overrides
- `localProductTestingEnv` - Local product-testing mode flag and deterministic seed user ids (allowed for local preview builds; refused in hosted deploys)
- `getAttemptCap` - Attempt cap overrides (implemented in `src/lib/config/env/ai.ts`)
- `regenerationQueueEnv` - Master switch for accepting plan regeneration requests (`REGENERATION_QUEUE_ENABLED`)
- `maintenanceEnv` - Manual maintenance controls and worker tokens
- `emailEnv` - Opted-in Resend delivery secrets (`RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_REPLY_TO`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`). `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` must be unpadded base64url encoding of at least 32 random bytes. Send enablement is the `email-notification-delivery` flag (fail-closed). Keep the secret configured for the unsubscribe token lifetime even while delivery is disabled. Live delivery also requires production `APP_URL` (https) via `appEnv.url` for signed unsubscribe links and body deeplinks — set it before enabling the flag.
- Module lesson generation kill-switch is the `module-lesson-generation` flag (fail-closed; declared in `src/flags.ts`, resolved via `src/features/lesson-content/generation-flag.ts`).
- `loggingEnv` - Logging, Sentry, and telemetry configuration

### Feature flags (Cloudflare Flagship)

Runtime feature gates live in one Cloudflare Flagship app, `atlaris-plan-generation` (DEV-192). The app evaluates them over HTTP through the OpenFeature server SDK and `FlagshipServerProvider` (`src/flags.ts`); the jobs Worker evaluates the same flags through its `FLAGS` binding (`workers/jobs/src/flags.ts`, registered with `registerWorkerFlags()` at the start of every handler and Workflow). Every evaluation carries an `environment` attribute (`development`, `staging` or `production`; the app derives it from `VERCEL_ENV`, the Worker uses `WORKER_ENV`), so one flag can target the two hosted environments differently with a targeting rule. Flags are created, renamed and deleted only in the Cloudflare dashboard (Flagship → `atlaris-plan-generation`) or with `pnpm exec cf flagship` from `workers/jobs/`, never from code.

| Variable                      | Purpose                                                                                                                                                                                                        | Required                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `FLAGSHIP_BACKEND_APP_ID`     | The backend Flagship app id (`pnpm exec cf flagship apps list`); the same id is pinned as `FLAGSHIP_APP_ID` in `workers/jobs/cloudflare.config.ts`. "Backend" leaves room for a separate frontend flags app later | Preview/Production (`VERCEL`) |
| `FLAGSHIP_BACKEND_ACCOUNT_ID` | The Cloudflare account id                                                                                                                                                                                      | Preview/Production (`VERCEL`) |
| `FLAGSHIP_API_TOKEN`          | A Cloudflare API token with only the **Flagship Evaluate** permission. Secret; synced by [secrets sync](./secrets-sync.md)                                                                                       | Preview/Production (`VERCEL`) |

`flagshipEnv` (`src/lib/config/env/flagship.ts`) reads them. When all three are set, `src/flags.ts` builds the provider once per process with a 5 s request timeout and response caching for 30 s (`FLAG_CACHE_TTL_MS`; the provider caches a flag per evaluation context and never caches a disabled flag or an error). When any is unset on a hosted deploy (`VERCEL` set), every evaluation throws `FlagEvaluationError` (`PROVIDER_NOT_CONFIGURED`) so the fail-safes below apply; locally and in tests, every flag returns its code default silently. A failed evaluation (provider setup, network, timeout, or a Flagship error code such as a missing flag) is remembered per flag and context for 30 s (`FLAG_FAILURE_TTL_MS`), logged once per window, and rethrown without another request until it expires, so an outage costs one request timeout per flag per half minute rather than one per call; successful values are never cached beyond the provider's own cache.

**Adding a flag:** create the boolean flag in the Flagship dashboard (or `pnpm exec cf flagship apps flags create` from `workers/jobs/`) with the default variation hosted environments should get, then export one function from `src/flags.ts` that calls `evaluateBoolean('<key>', false, context?)`, wrap it in a fail-closed helper under `src/features/` like `isGroundedEnabled`, and add a row to the table below. The Worker needs nothing extra: `registerWorkerFlags()` already routes the shared helpers through its binding. Never create, rename or delete flags from code or CI.

Declared flags (code default is `false` for all of them; the dashboard's default variation is what hosted environments get when a flag has no matching rule):

| Flag key                      | Code export                 | Default / failure mode                                                                                                                                                                                                                                                                                          | Combines with                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance-mode`            | `maintenanceMode`           | First production gate. Evaluation errors use the `MAINTENANCE_MODE` fail-safe if env is true, otherwise **fail open** (site stays available) via `resolveSiteGate()` in `src/lib/proxy/site-gate.ts`                                                                                                             | `MAINTENANCE_MODE` env (`appEnv.maintenanceMode`) — fail-safe only if flag evaluation throws; unused when the flag resolves. Do not set env for normal ops.                                                                     |
| `launch-waitlist`             | `launchWaitlist`            | Pre-launch gate. Evaluation errors use the `LAUNCH_WAITLIST` fail-safe if env is true (**fail closed** to `/waitlist`), otherwise **fail open** (app stays available) via `resolveSiteGate()` in `src/lib/proxy/site-gate.ts`. `maintenance-mode` wins when both are on                                          | Clerk sign-up mode **Waitlist** (Clerk Dashboard → Restrictions) so `/waitlist` signups are accepted. `LAUNCH_WAITLIST` env (`appEnv.launchWaitlist`) — fail-safe only if flag evaluation throws; unused when the flag resolves |
| `email-notification-delivery` | `emailNotificationDelivery` | Evaluation errors **fail closed** via `resolveEmailNotificationDeliveryEnabled()` in `src/features/notifications/email/delivery-flag.ts`                                                                                                                                                                        | Resend + production `APP_URL` (see `emailEnv`)                                                                                                                                                                                  |
| `module-lesson-generation`    | `moduleLessonGeneration`    | Evaluation errors **fail closed** via `resolveModuleLessonGenerationEnabled()` in `src/features/lesson-content/generation-flag.ts`                                                                                                                                                                              | Synchronous and Cloudflare Workflow module lesson generation                                                                                                                                                                    |
| `grounded-generation`         | `groundedGeneration(tier)`  | Boolean per tier: evaluated with a `subscriptionTier` attribute (`free`, `starter`, `pro`), so the tiers that run grounded generation are a targeting rule on that attribute. `isGroundedEnabled(tier)` in `src/features/ai/grounded-generation-flag.ts` returns false on any evaluation error (**fail closed**). The Worker evaluates the same flag through its binding | Grounded generation (research, verify, advisor) per tier; policy in `getGroundedOperationPolicy()` in `src/features/ai/model-operation-policy.ts`. Off keeps the current pipeline                                               |

**Local without `FLAGSHIP_*`:** all flags resolve to their code default (`false`), so email delivery, lesson generation, grounded generation, maintenance, and the launch waitlist stay off. `MAINTENANCE_MODE` and `LAUNCH_WAITLIST` are not local overrides — they apply only if flag evaluation throws. Setting the three `FLAGSHIP_*` values in `.env.local` evaluates the real flags with `environment: development`, which no hosted rule targets, so you get each flag's dashboard default.

**Local maintenance page preview:** in development, `/maintenance` stays reachable while the flag is off so the page can be designed and checked without taking the rest of the app down. Hosted Preview/Production still redirect `/maintenance` home when the flag is off. Turning the flag on sends the app to `/maintenance` but keeps the marketing pages (`/landing`, `/pricing`, `/about`) live; `/` redirects to `/landing`. App and auth links on those pages (sign in, sign up, plan CTAs, dashboard) still land on `/maintenance`, and pricing CTAs skip Clerk sign-in/checkout modals. The site header renders every visitor as signed out, so Clerk's account menu is hidden.

**Launch waitlist:** `launch-waitlist` runs the same gate as maintenance for signed-out visitors (marketing pages live, header signed out, pricing CTAs through the proxy) but redirects to `/waitlist`, a marketing page with a Clerk waitlist form (`clerk.joinWaitlist`). Redirects from `/auth/sign-up*` carry `?from=sign-up` so the page tailors its copy. `/waitlist` follows the same preview rule as `/maintenance`: reachable locally while its flag is off, redirected home on hosted environments.

**Batch admission while the waitlist is on:** the waitlist gate admits anyone with a Clerk session (`resolveViewerSiteGate()` in `src/lib/proxy/middleware-policy.ts`); maintenance still holds everyone. This relies on Clerk's sign-up mode being **Waitlist**, so only users invited from Clerk Dashboard → Waitlist, or created by an admin, can have an account; every existing account in the instance gets in. The proxy reads the session only when the gate is `waitlist`, from the request `clerkMiddleware` already authenticated, and the gate cache stays per instance, not per user. The site header and pricing page apply the same rule, so admitted users see their account and live checkout. `/auth/sign-in*` stays reachable during the waitlist so admitted users can sign back in; Clerk's own "Join waitlist" link there opens `/waitlist` (`waitlistUrl` on `ClerkProvider`). To admit a batch, select **Invite** on each entry in Clerk Dashboard → Waitlist. The "Accept invitation" email opens the Clerk Account Portal sign-up page (`accounts.atlaris.app/sign-up` with `__clerk_ticket`), not the app's `/auth/sign-up`, and returns the new user to `https://atlaris.app/`, which sends them to the dashboard. Keep Dashboard → Paths sign-up on the Account Portal: an app-domain sign-up path would land invitations on `/auth/sign-up`, which still redirects signed-out visitors to `/waitlist`.

At launch, turn the flag off, wait 60 seconds, then switch the Clerk sign-up mode back to Public (Dashboard label **Open**). Switching Clerk first lets anyone sign up on the Account Portal and pass the gate early.

**Maintenance bypass paths** (still reachable while maintenance or the launch waitlist is on) are listed in `src/lib/proxy/middleware-policy.ts` (`isSiteGateExempt()`), including every `/api/internal/` route, `GET /api/health/worker`, the signed unsubscribe route, and the marketing pages. Ops for email delivery: [Email notification delivery runbook](../architecture/email-notification-delivery-runbook.md).

Hosted templates list `FLAGSHIP_BACKEND_APP_ID`, `FLAGSHIP_BACKEND_ACCOUNT_ID` and `FLAGSHIP_API_TOKEN` in `.env.preview.example` and `.env.production.example`. Production also documents `MAINTENANCE_MODE` and `LAUNCH_WAITLIST`.

**Gate caching:** the proxy never reads the gate flags for exempt paths. Everywhere else, `resolveSiteGate()` (proxy, site header, pricing page) caches the gate for 60 seconds per instance (`SITE_GATE_CACHE_TTL_MS` in `src/lib/proxy/site-gate.ts`), so the proxy evaluates the two gate flags at most once a minute per instance, never per request, and a flag change can take up to a minute to apply everywhere (plus Flagship's own propagation, about 30 s). A gate that came from a `MAINTENANCE_MODE` or `LAUNCH_WAITLIST` fallback is cached for only 10 seconds (`SITE_GATE_FALLBACK_CACHE_TTL_MS`), which bounds flag reads and Sentry events (`feature` tag `maintenance_flag` or `launch_waitlist_flag`, `outcome` `fail_open` or `fail_closed`) during a Flagship outage. A clean `maintenance-mode` On read keeps the full TTL even if `launch-waitlist` falls back, because maintenance wins either way. There is no per-request override: QA of a gated page needs a Clerk session (waitlist) or a flag change in the dashboard.

### Flag and gate ownership

Operational kill switches are Cloudflare Flagship flags, shared by the app and the jobs Worker. Deployment, maintenance, privacy, observability, local-test, secret, and capacity controls stay environment configuration, and the Worker's per-job switches (`JOBS_PAUSED`, `JOB_*_ENABLED`, `PARALLEL_DIRECT_RESEARCH`) stay Worker secrets ([cloudflare-jobs-runtime.md, Decision 7](../architecture/cloudflare-jobs-runtime.md#decision-7-cutover-and-pause)). Future user-, cohort-, anonymous-visitor-, percentage-rollout-, and experiment-driven product behavior belongs in PostHog. Do **not** create PostHog flags for the operational switches in the [Feature flags](#feature-flags-cloudflare-flagship) table. No currently active Atlaris flag moves to PostHog.

`src/flags.ts` is the only flag declaration file: one exported function per flag key, each evaluated with the code default `false`. Preference Settings opt-ins are not flags — see [user-preferences.md](../architecture/user-preferences.md).

`maintenance-mode` is the first production gate: turn it On/Off in the Flagship dashboard. `MAINTENANCE_MODE` is a fail-safe only — if flag evaluation throws and the env is `true`, force maintenance; otherwise fail open. Do not set the env for day-to-day ops, and do not also set it `true` when the flag is already On.

`LAUNCH_WAITLIST` is the same kind of fail-safe for `launch-waitlist`: if flag evaluation throws and the env is `true`, force the waitlist; otherwise fail open. Set it `true` in Production while the app is pre-launch so a flag outage cannot open the app, and clear it at launch together with the flag. Keep every flag that `src/flags.ts` declares defined in the Flagship app: a missing flag evaluates with `FLAG_NOT_FOUND`, which `src/flags.ts` throws, so the gate runs on its fail-safe and reports to Sentry about every 10 seconds per instance.

#### Deployment and maintenance gates (owner × runtime)

The five flags above are the only Flagship keys. Everything in this table is env, scheduler, or database cron — not a Flagship flag and not a PostHog flag.

| Control                                                                  | Owner                                                | Runtime                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAINTENANCE_MODE`                                                       | Vercel env (`appEnv`)                                | Fail-safe only when `maintenance-mode` evaluation throws; unused on the happy path                                                                                                                                                                                                                                                                                                                                            |
| `LAUNCH_WAITLIST`                                                        | Vercel env (`appEnv`)                                | Fail-safe only when `launch-waitlist` evaluation throws; unused on the happy path                                                                                                                                                                                                                                                                                                                                             |
| `FLAGSHIP_BACKEND_APP_ID` / `FLAGSHIP_BACKEND_ACCOUNT_ID` / `FLAGSHIP_API_TOKEN` | Vercel env (`flagshipEnv`)                   | Lets the app evaluate Flagship flags over HTTP; all three missing on a hosted deploy makes every evaluation throw (fail-safes apply), locally it uses each flag's code default                                                                                                                                                                                                                                              |
| `REGENERATION_QUEUE_ENABLED` + `JOBS_WORKER_URL` + `JOBS_SIGNING_SECRET` | Vercel env (`regenerationQueueEnv`, `jobsWorkerEnv`) | `REGENERATION_QUEUE_ENABLED` is the app master switch: when off, `POST /api/v1/plans/:planId/regenerate` answers `503`. When on, the route inserts a `job_queue` row and sends a signed `POST /v1/regeneration/enqueue` to the jobs Worker, which runs it through a Cloudflare Queue. The Worker-side switch is `JOB_REGENERATION_ENABLED` ([regeneration-worker-runbook.md](../architecture/regeneration-worker-runbook.md)) |
| `PLAN_CLEANUP_ENABLED` + `MAINTENANCE_WORKER_TOKEN`                      | Vercel env (`maintenanceEnv`)                        | Manual HTTP `POST /api/internal/maintenance/plans/cleanup` only. The jobs Worker cron runs the scheduled cleanup                                                                                                                                                                                                                                                                                                              |
| `RETENTION_CLEANUP_ENABLED` + `MAINTENANCE_WORKER_TOKEN`                 | Vercel env (`maintenanceEnv`)                        | Manual HTTP `POST /api/internal/maintenance/retention/cleanup` only                                                                                                                                                                                                                                                                                                                                                           |
| `JOB_RETENTION_CLEANUP_ENABLED` (Worker secret)                          | Cloudflare jobs Worker                               | Worker cron `0 3 * * *` runs `private.cleanup_retained_db_rows()` daily; does not read the HTTP env vars. The former Supabase `retention-cleanup` pg_cron job is no longer scheduled. See [retention-cleanup-runbook.md](../architecture/retention-cleanup-runbook.md)                                                                                                                                                        |
| `PARALLEL_DIRECT_RESEARCH` + `PARALLEL_API_KEY` (Worker secrets)         | Cloudflare jobs Worker                               | Grounded plan research searches Parallel directly with our key, then the model writes the brief from those results (DEV-171; `isDirectResearchEnabled(env)` in `workers/jobs/src/switches.ts`). Unset is off, as is `true` without the key: research keeps using OpenRouter's `web_search` server tool. Applies to plan generation and grounded regeneration                                                                  |
| `CLERK_BILLING_RECONCILIATION_ENABLED` + `MAINTENANCE_WORKER_TOKEN`      | Vercel env (`maintenanceEnv`)                        | Manual HTTP `POST /api/internal/maintenance/billing/reconcile-clerk`                                                                                                                                                                                                                                                                                                                                                          |
| `WORKER_HEALTH_TOKEN`                                                    | Vercel env (`maintenanceEnv`)                        | `GET /api/health/worker`                                                                                                                                                                                                                                                                                                                                                                                                      |

Route auth and enablement contract: [internal-worker-routes.md](../architecture/internal-worker-routes.md). Env facets for privacy, observability, local-test, secrets, and capacity (`loggingEnv` / Sentry, Clerk / Resend / OpenRouter, `LOCAL_PRODUCT_TESTING`, AI attempt caps) stay in `@/lib/config/env` and are not Flagship keys.

#### PostHog

PostHog is analytics ingest today (`posthog-js`, `posthog-node`, application-owned `/ingest` proxy). Project `551450` had zero active flags when audited on September 2, 2026. Reserve PostHog for future product experiments and cohort rollouts. Do not wire a PostHog flag provider for `maintenance-mode`, `launch-waitlist`, `email-notification-delivery`, `module-lesson-generation`, or `grounded-generation`.

The app initializes PostHog, identifies users, captures browser events, and captures server events only when `NODE_ENV=production` and the deployment is explicitly Vercel Production. `VERCEL_TARGET_ENV` takes precedence over `VERCEL_ENV`; a custom target such as `staging`, or the standard `VERCEL_ENV=preview`, disables PostHog even though Vercel sets `NODE_ENV=production` for those deployments. The browser receives the corresponding values as `NEXT_PUBLIC_VERCEL_TARGET_ENV` and `NEXT_PUBLIC_VERCEL_ENV` from `next.config.ts`. Missing deployment markers fail closed. Local development, tests, Preview, and Staging therefore do not initialize the SDK or issue application-owned PostHog captures.

`POSTHOG_PERSONAL_API_KEY` (server-only) is a personal API key scoped to project `551450` with `person:write`. It lives in `atlaris-vercel-prod` and `atlaris-worker-production`, and in `atlaris-worker-preview` so the staging Worker's required secrets are complete. Staging keeps `JOB_POSTHOG_DELETION_ENABLED=false`, so it never calls PostHog. Account deletion uses it to delete the user's PostHog person, events, and recordings (`src/features/auth/posthog-person-deletion.ts`). The in-app delete and the Clerk `user.deleted` webhook both try right away, so deletions from the Clerk dashboard are covered too, and set `users.posthog_deleted_at` when PostHog accepts. A missing key or a failed call is logged and does not block the deletion. The jobs Worker's daily `0 3 * * *` cron (`JOB_POSTHOG_DELETION_ENABLED`) retries every tombstoned user whose `posthog_deleted_at` is still null, and reports a failure to Sentry tagged `job:posthog-deletion`.

### Adding New Variables

If you need a new variable:

1. Add it to the owning facet under `src/lib/config/env/`.
2. Include proper validation (using Zod)
3. Re-export it from `src/lib/config/env.ts` only when it is a stable shared config; otherwise keep the direct facet import and document it here.

### Auth Variables

The application uses Clerk Auth for UI, route protection, and server session reads.

**Clerk UI delivery:** Auth and billing UI load from Clerk’s CDN through the default `@clerk/nextjs` `ClerkProvider` path (`src/app/layout.tsx`). The app does **not** pin or bundle `@clerk/ui`. CSP allows Clerk Frontend API scripts via `https://*.clerk.accounts.dev` (plus the Production Frontend API host decoded from the publishable key) and Clerk's bot protection via `https://*.protect.clerk.com` (`script-src` and `frame-src`) in `src/lib/proxy/security-headers.ts`. If sign-in, UserButton, or pricing UI fails to load, check that CSP allowlist and network access to Clerk accounts hosts before assuming an app bug. Appearance and localization still come from Atlaris props on `ClerkProvider`.

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

Module lesson generation enablement is the Flagship flag `module-lesson-generation` (fail-closed / default disabled). See `docs/development/deploy.md`.

### Internal worker routes

Shared bearer tokens for manual POST routes under `/api/internal/`. See `docs/architecture/internal-worker-routes.md`.

| Variable                               | Purpose                                                            | Required in production                              |
| -------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `RETENTION_CLEANUP_ENABLED`            | Master switch for the **manual** retention cleanup HTTP route only | Set `true` only when enabling the manual route      |
| `PLAN_CLEANUP_ENABLED`                 | Master switch for the plan cleanup HTTP route                      | Set `true` only when enabling the manual route      |
| `CLERK_BILLING_RECONCILIATION_ENABLED` | Master switch for the manual Clerk Billing reconciliation route    | Set `true` only when enabling manual reconciliation |
| `MAINTENANCE_WORKER_TOKEN`             | Auth for the manual maintenance routes                             | Yes when any maintenance route is enabled           |
| `WORKER_HEALTH_TOKEN`                  | Auth for `GET /api/health/worker` operator metrics                 | Yes                                                 |

Scheduled retention cleanup runs from the jobs Worker's cron (`private.cleanup_retained_db_rows()`) and does not use these HTTP env vars. See `docs/architecture/retention-cleanup-runbook.md`.

Scheduled plan cleanup runs from the jobs Worker's cron trigger. The `POST /api/internal/maintenance/plans/cleanup` route is for manual operations and is protected by `MAINTENANCE_WORKER_TOKEN`.

Email notification delivery runs on the jobs Worker (Workflow schedules). The manual recovery route is protected by `MAINTENANCE_WORKER_TOKEN` and forwards a signed command to the Worker, so it needs `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET`; see [the email delivery runbook](../architecture/email-notification-delivery-runbook.md).

Clerk Billing sends signed events to `POST /api/v1/clerk/billing/webhook` using `CLERK_WEBHOOK_SIGNING_SECRET`. Manual drift repair runs through `POST /api/internal/maintenance/billing/reconcile-clerk` when `CLERK_BILLING_RECONCILIATION_ENABLED=true`; the route processes up to 100 users and returns `nextCursor` for the next batch. Architecture (projection, quotas, checkout sync): [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md).

### Cloudflare jobs Worker

App-side settings for signed commands to the `atlaris-jobs` Worker. See [cloudflare-jobs-runtime.md](../architecture/cloudflare-jobs-runtime.md) (Decision 4) and [regeneration-worker-runbook.md](../architecture/regeneration-worker-runbook.md).

| Variable              | Purpose                                                                                                                          | Required in production                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `JOBS_WORKER_URL`     | Jobs Worker origin (`https://workers-staging.atlaris.app` on the `develop` Preview, `https://workers.atlaris.app` in Production) | Yes: plan create/retry, plan regeneration, module lessons, and the manual email route always use the Worker |
| `JOBS_SIGNING_SECRET` | HMAC key for app → Worker commands; must equal the Worker's `JOBS_SIGNING_SECRET` for that environment                           | Yes: same as `JOBS_WORKER_URL`                                                                              |

A missing URL or secret, or any non-2xx Worker response, leaves the regeneration job `pending`; the Worker's 15-minute sweep re-sends it. For module lessons the same failures revert the provisional claim: `503 jobs_paused` / `job_disabled` returns `disabled` (HTTP 503), anything else returns `provider_failure` (HTTP 502). For plan create and retry the same failures settle the reserved attempt as a retryable `provider_error` and return `503 GENERATION_FAILED` with `details.planId`. There is no runtime switch for plan create/retry or regeneration: both always use the Worker. For the manual email route, `503 jobs_paused` / `job_disabled` returns `outcome: disabled` and any other failure returns `503`.

### Feature flags (`src/flags.ts`)

Canonical table (env vars, fail-open/closed behavior, and local fallback): [Feature flags (Cloudflare Flagship)](#feature-flags-cloudflare-flagship) above. Ownership (Flagship vs env vs PostHog) and the deployment/maintenance inventory: [Flag and gate ownership](#flag-and-gate-ownership). Preference Settings are separate from these kill switches — see [user-preferences.md](../architecture/user-preferences.md).

### Local product testing (development / test)

| Variable                | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `LOCAL_PRODUCT_TESTING` | Master flag for the seeded-user + mocks workflow (forbidden in hosted deploys)    |
| `MOCK_AI_SCENARIO`      | Mock AI: `success`, `timeout`, `provider_error`, `invalid_response`, `rate_limit` |

Clerk Billing local fixtures do not require Stripe app env vars. Use `pnpm db fixture --user-id <users.auth_user_id> --plan pro` to apply a local billing projection through the same service path as Clerk webhooks. Clerk Billing uses Stripe as the payment gateway, but Atlaris reads entitlement state from Clerk events and reconciliation.

**Fixture mode does not exercise checkout or webhooks.** It only updates the Postgres entitlement projection for local product testing.

Google Calendar is intentionally not implemented right now. The settings page keeps a static `Coming Soon` placeholder so the product surface remains visible without implying a partial OAuth flow.

### Clerk development checkout (fixture vs real payment flow)

Atlaris keeps a single entitlement source: the Postgres `users` projection updated from Clerk Billing webhooks/reconciliation. Do not add Clerk `auth().has({ plan })` checks alongside DB tiers. For webhook → projection → quota details, see [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md).

Startup fails in development when Clerk UI would be enabled while `DEV_AUTH_USER_ID` is also set (`LOCAL_PRODUCT_TESTING=false` + non-empty `DEV_AUTH_USER_ID`). Choose exactly one mode:

| Mode                                | Env contract                                                                                                                                                      | What it proves                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Fixture / local product testing** | `LOCAL_PRODUCT_TESTING=true`, `DEV_AUTH_USER_ID` = seeded `users.auth_user_id`                                                                                    | DB entitlements and quota UI via `pnpm db fixture --user-id <users.auth_user_id> --plan <starter | pro>`, followed by `pnpm dev`. **Does not** test Clerk checkout or webhooks. |
| **Real Clerk development checkout** | `LOCAL_PRODUCT_TESTING=false` (or unset), `DEV_AUTH_USER_ID` unset/empty, Clerk **test** keys for one Development instance, usable `CLERK_WEBHOOK_SIGNING_SECRET` | Checkout → Clerk webhook → Postgres projection → Atlaris quota.                                  |

**Fixture mode and Clerk UI:** When local product testing is on, `shouldUseClerkUi()` in `src/lib/auth/local-identity.ts` returns `false`. Root layout skips `ClerkProvider`, so sign-in modals, UserButton, and Clerk Billing components do not mount. `/pricing` still renders plan cards with the existing page composition through `LocalPricingPreview` (representative prices; every CTA is “Preview only” / disabled). Use real Clerk development checkout mode to exercise live pricing checkout.

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

Before checkout, `/pricing` adds the signed-in user's current billing signature to Clerk's `/settings/billing?checkout=1&checkoutBaseline=...` return URL. Settings compares that short-lived UI-only baseline with the DB-backed subscription API, shows a bounded “Updating your subscription…” state while the webhook projection catches up, then removes both query markers and refreshes the rows. Settings remains the DB-backed account and entitlement surface.

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

Use `pnpm db start` to start the native Supabase stack. It writes the stack's URL into this worktree's `.env.local`; the port is assigned by the CLI (20000–32767), so there is no fixed value to copy. See [local-database.md](./local-database.md).

| Variable                   | Local source                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `POSTGRES_URL`             | Written by `pnpm db start` / `pnpm db agent up` (`env.DB_URL`) |
| `POSTGRES_URL_NON_POOLING` | Written by the same commands, same value as `POSTGRES_URL`     |

The native stack runs no REST API, so the local app needs no Supabase URL or API keys.

### Local laptop (1Password Environments)

`pnpm dev` authenticates `op` with a keychain-backed service account and still
needs `OP_ENVIRONMENT_ID` in `~/.config/atlaris/dev.sh` or the shell. Setup:
[1Password local development](../third-party-services/1password-local-dev.md).

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
- `docs/architecture/email-notification-delivery-runbook.md` - Email delivery ops + preference model
- `src/flags.ts` - Feature flag declarations (Cloudflare Flagship through OpenFeature)
- `src/lib/config/env/flagship.ts` - `FLAGSHIP_*` settings for the app's flag evaluation
- `src/lib/config/env.ts` - Stable environment-config compatibility barrel; facet modules under `src/lib/config/env/` own definitions and validation
- `src/lib/logging/logger.ts` - Server-side Pino structured logging
- `src/lib/logging/client.ts` - Client-side console wrapper
- `src/lib/logging/request-context.ts` - Request context helpers for API routes
