# Cloudflare Workers Job Runtime

**Audience:** Developers and the orchestrator implementing Track B (JCS-120) phases B1–B7.
**Last Updated:** October 2026
**Status:** Accepted design for JCS-126 (B0); review decisions recorded 2026-10-05. One question remains open (see the end). No Worker code, Wrangler configuration, or Cloudflare resources exist yet.

This note fixes how the `workers/jobs` Worker is laid out, reaches Supabase, loads configuration, receives work from the Next.js app, reports problems, deploys, and takes over each background job. The user-executed setup that follows from it is in [cloudflare-b1-checklist.md](./cloudflare-b1-checklist.md).

Already decided (not reopened here): all background execution moves to Cloudflare Workers (Cron Triggers, Queues, Workflows, Hyperdrive); Vercel keeps hosting Next.js; Supabase stays the database; Workers Builds deploys the Worker; the app only starts work and reads status from the database; plan create/retry drops SSE for create + status polling (B6).

## Summary

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Repo layout | `workers/jobs/` with its own `wrangler.jsonc` and `tsconfig.json`; Wrangler's esbuild bundles root `@/` and `@supabase/` imports; Next/Vercel-only modules are replaced with Wrangler `alias`; the Worker talks to Postgres with node-postgres + Drizzle through Hyperdrive, one pool per invocation |
| 2 | Environments | `staging` → Worker `atlaris-jobs-staging` + Supabase `atlaris-dev`, deployed from the Track B parent branch until Track B first merges into `develop`, then from `develop`; `production` → `atlaris-jobs-production` + `atlaris-prod` from `main`; Workers served on custom domains `workers-staging.atlaris.app` and `workers.atlaris.app` after the `atlaris.app` zone moves to Cloudflare; Hyperdrive connects as `postgres`; the top level is local-only |
| 3 | Config | Worker variables and secrets reuse the app's env names; `process.env` is filled from them automatically, so `src/lib/config/env/*` validates them unchanged; one Worker-only module validates bindings and switches |
| 4 | App ↔ Worker | App sends HMAC-signed HTTPS commands to the Worker's custom domain (`POST /v1/<command>`), behind one zone rate-limiting rule; the Worker uses its own Queue and Workflow bindings; the app reads status from Postgres only |
| 5 | Observability | `@sentry/cloudflare` in a separate Sentry project, `atlaris-jobs`, with release = commit SHA so it matches the app's release; Workers Logs; the Workflows dashboard replaces Vercel workflow observability; the existing cron monitor slugs move to the new project |
| 6 | Deploy order | Expand migration → Worker → app, as separate merges → contract migration. The Worker accepts old and new command shapes during a change |
| 7 | Cutover | One owner per job at all times, with fixed observation windows. Worker job switches are dashboard-managed variables that default to off, plus a global `JOBS_PAUSED`. The Worker does not follow the app's `MAINTENANCE_MODE`. B4's production cutover follows B5's CPU gate |
| 8 | Cron and Queue | Two Worker Cron Triggers per environment (4 of 5 account-wide) plus Workflow `schedules` for email. Regeneration uses a Cloudflare Queue for intake, delayed retry, and a concurrency cap; `job_queue` stays the record, and a 15-minute sweep re-sends lost work |
| 9 | CPU | Cron jobs are low risk; email is medium (subrequests); every AI job is high risk on the 10 ms Free limit. Measure on staging starting in B4 and decide Workers Paid before any AI job's production cutover |

### Findings that change the parent issue's assumptions

1. **Cron Triggers are limited to 5 per account on Free, not per Worker** [workers-limits]. Staging and production are separate Workers that share the limit, so "4 of 5" per environment would need 8. Decision 8 fits both environments in 4.
2. **Cloudflare documents Drizzle + Postgres.js over Hyperdrive as unsupported** [hd-drizzle]. That is this repo's only DB stack (`supabase/service-role.ts:47-48`). Decision 1 adds node-postgres for the Worker.
3. **Cloudflare cron weekdays start at 1 = Sunday** [cron-triggers]. The weekly email expression `30 14 * * 1` (`vercel.json:10`) means Monday on Vercel but Sunday on Cloudflare. Use `30 14 * * MON`.
4. **B4 is the first phase that runs AI work on Workers**, not B5. Regeneration finalization also starts module lesson workflows (`src/features/plans/lifecycle/generation-finalization/store.ts:151` → `src/features/lesson-content/progressive-enqueue.ts`), which the Worker cannot do until B5 ships the lessons Workflow. Decided: B4's production cutover follows B5's CPU gate (Decisions 7 and 9).

## Current job inventory

| Job | Trigger today | Schedule | Code entry | Auth today | Cloudflare target | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| Stuck-plan and orphaned-attempt cleanup | GitHub Actions → `POST /api/internal/maintenance/plans/cleanup` | `*/15 * * * *` (`.github/workflows/plan-cleanup-scheduler.yml:4-5`; repo variable gate on line 17) | `runPlanCleanupMaintenance` (`src/features/plans/cleanup.ts`); Sentry monitor `plan-cleanup-maintenance` (`src/app/api/internal/maintenance/plans/cleanup/route.ts:6-15`) | `MAINTENANCE_WORKER_TOKEN` | Cron `*/15 * * * *` | B3a |
| Retention cleanup | Supabase `pg_cron` job `retention-cleanup` | `0 3 * * *` (`supabase/migrations/20260522223908_schedule_retention_cleanup.sql:64-68`) | `cleanupRetainedDbRows` → `private.cleanup_retained_db_rows()` (`src/lib/db/queries/admin/retention.ts`) | none (in-database) | Cron `0 3 * * *` | B3a |
| Email daily and weekly | Vercel Cron → `GET /api/cron/notifications/email?runKind=…` → Vercel Workflow | `0 14 * * *`, `30 14 * * 1` (`vercel.json:3-12`) | `start-email-notification-delivery-workflow.ts`, `workflows/email-notification-delivery.{workflow,steps}.ts`; monitors in `delivery-monitor.ts:5-24` | `CRON_SECRET`; manual route uses `MAINTENANCE_WORKER_TOKEN` | Workflow with `schedules` | B3b |
| Plan regeneration | Enqueue route starts a Vercel workflow immediately; GitHub Actions drain every 15 minutes as fallback | `*/15 * * * *` (`.github/workflows/regeneration-worker-scheduler.yml:4-5`; gate on line 17) | `requestPlanRegeneration` → `attachPlanRegenerationWorkflow`; `planRegenerationWorkflow` claim → reserve → process → finalize (`src/features/plans/workflows/plan-regeneration.workflow.ts:17-36`) | `REGENERATION_WORKER_TOKEN` | Queue + consumer, sweep in the `*/15` cron | B4 |
| Module lesson generation | `POST …/lesson-content/generate` → `workflow/api.start`; progressive enqueue after plan finalization | on demand | `startModuleLessonGeneration`, `moduleLessonGenerationWorkflow` | user session | Workflow | B5 |
| Plan create/retry | `POST /api/v1/plans/stream` (SSE): reserves in-process, starts `planGenerationWorkflow`, awaits `run.returnValue` | on demand | `createWorkflowBackedProcessGeneration` (`src/features/plans/create-workflow-backed-process-generation.ts:63-104`) | user session | Workflow | B6 |
| Clerk Billing reconciliation | Manual `POST /api/internal/maintenance/billing/reconcile-clerk` | manual | `src/features/billing/clerk-billing/reconciliation.ts` (imports `@clerk/nextjs/server`) | `MAINTENANCE_WORKER_TOKEN` | Stays on Vercel: manual repair, not a background job, and depends on the Next Clerk SDK | — |

Workflow SDK wiring removed in B7: `withWorkflow()` (`next.config.ts:6,109-114`), the `/.well-known/workflow/` proxy branch (`src/lib/proxy/workflow-callback-auth.ts`), the `workflow` dependency, `vercel.json` crons, and both GitHub schedulers.

## Runtime compatibility audit

**Direct imports.** Checked with grep on 2026-10-05: `src/features/{ai,plans,lesson-content,notifications,billing}` and `src/lib/db` import nothing from `next` or `next/*`, and no file in the repository imports the `server-only` package. The only Node built-in they import directly is `node:crypto` (`src/features/notifications/email/unsubscribe-token.ts:1`, `src/features/billing/clerk-billing/reconciliation.ts:26`, `src/lib/db/queries/email-notification-deliveries.ts:8`, `src/lib/db/queries/attempts.ts:55`). Workers supports all of `node:crypto` except DSA/DH key generation, argon2, and ed448/x448 [node-crypto]. Nothing imports `fs`, `child_process`, or `net`.

**Transitive imports.** The parent issue's claim is true for direct imports but not for what the Worker would bundle. A static import walk from each job entry point (relative, `@/`, and `@supabase/` paths; type-only imports skipped) reaches:

| Transitive import | Reached by | Problem on Workers | Resolution |
| --- | --- | --- | --- |
| `flags/next` and `@flags-sdk/vercel` via `src/flags.ts:1-3` | email (`delivery-flag.ts`), lessons (`generation-flag.ts`), and regeneration and plan generation through `progressive-enqueue.ts` → `start-module-lesson-generation-workflow.ts` | `flags/next` is Next-bound; `@vercel/flags-core` 1.7.1 imports `@vercel/oidc`, `@vercel/functions`, and `next/cache` | Alias both to Worker modules that read Worker switches (Decision 7) |
| `workflow`, `workflow/api` (Vercel Workflow SDK) | email start, regeneration, lesson start, plan generation | Starts runs in the Vercel world; unusable from Cloudflare | The Worker never imports the `*.workflow.ts`/`*.steps.ts` wrappers. It calls the domain functions they wrap, injects its own starters through existing seams (`enqueueModuleLessonGenerations(params, { start })`, `progressive-enqueue.ts:59-71`), and aliases the SDK to a module whose functions throw |
| `@sentry/nextjs` | `src/lib/observability/metrics.ts:1`, `src/lib/logging/ops-alerts.ts`, `src/features/ai/usage.ts`, `src/features/ai/providers/openrouter.ts`, `src/features/ai/orchestrator/provider-invocation.ts`, `src/features/notifications/email/delivery-monitor.ts` | Next SDK. Job code uses only `captureCheckIn`, `captureException`, `metrics.count`, `metrics.distribution`, `startSpan`, `startSpanManual`, `withScope` | Alias to `@sentry/cloudflare` pinned to the installed `@sentry/nextjs` version (10.70.0); B2 typechecks the alias |
| `pino` (`src/lib/logging/logger.ts:2`) | every job | Node transport stack (`sonic-boom`, `thread-stream`; see `serverExternalPackages`, `next.config.ts:51-58`) | B2 confirms the bundle resolves pino's browser build, which logs to the console; otherwise alias `pino` to `pino/browser` |
| `postgres` + `drizzle-orm/postgres-js` (`supabase/service-role.ts:47-48`) | every job | Module-level singleton (`supabase/service-role.ts:61-84`) reuses I/O across requests, which Workers forbids [hd-troubleshoot]; and Drizzle + Postgres.js over Hyperdrive is unsupported [hd-drizzle] | Decision 1 |
| `node:async_hooks` (`src/lib/api/context.ts`) | cleanup, regeneration, lessons, plan generation | None with Node.js compatibility enabled [als] | — |
| `@openrouter/sdk` 0.13.67 (depends only on `zod`), `resend` 6.18.0 (`postal-mime`, `standardwebhooks`) | AI jobs; email | Fetch-based, but not yet run on workerd | Proven by the B4 and B3b bundles and staging runs |
| `next/cache` (`src/lib/next/revalidate-paths.ts`), `react`, `@clerk/nextjs/server`, `lru-cache` | Only task-progress actions, the session hook, billing reconciliation, and request rate limiting | Not on any job path | Must stay unreachable; the per-phase bundle check fails if they appear |

The walk is a guide. The authoritative check is the bundle that Wrangler produces for each phase (Decision 1).

## Decision 1: Repository layout and build

### Decision

```text
workers/jobs/
├── wrangler.jsonc              # name "atlaris-jobs"; env.staging, env.production
├── tsconfig.json               # extends ../../tsconfig.json; Workers types; same @/ and @supabase/ paths
├── worker-configuration.d.ts   # generated by `wrangler types`, committed
├── .dev.vars.example           # variable names only
└── src/
    ├── index.ts                # Sentry.withSentry({ fetch, scheduled, queue }); re-exports Workflow classes
    ├── env.ts                  # Env type; zod check of Worker-only bindings, JOBS_SIGNING_SECRET, switches
    ├── db.ts                   # per-invocation node-postgres Pool from env.HYPERDRIVE → Drizzle
    ├── switches.ts             # JOBS_PAUSED and JOB_*_ENABLED readers
    ├── http/                   # fetch router: GET /healthz, POST /v1/<command>
    ├── runtime/                # alias targets for Next- and Vercel-only modules
    ├── jobs/<job>.ts           # plan-cleanup, retention-cleanup, regeneration-sweep, regeneration-consumer
    └── workflows/<name>.ts     # email-delivery, module-lessons, plan-generation
```

- **Router.** `src/index.ts` exports `fetch` (signed commands and `/healthz`), `scheduled` (switch on `controller.cron`), and `queue` (regeneration consumer), wrapped in `Sentry.withSentry`, plus each Workflow class wrapped in `Sentry.instrumentWorkflowWithSentry` [sentry-wrangler].
- **Shared contract.** Command schemas and request signing live in `src/lib/jobs-contract/`, imported by both the app and the Worker, so one definition exists.
- **Import resolution.** Wrangler bundles with esbuild [bundling]. `wrangler.jsonc` sets `tsconfig` to `workers/jobs/tsconfig.json` [wrangler-config], which repeats the root mappings (`@/*` → `../../src/*`, `@supabase/*` → `../../supabase/*`; root mapping in `tsconfig.json:19-23`). The root `tsconfig.json` excludes `workers/`, and the Worker gets its own `tsc -p workers/jobs` check, because the root program is typed for DOM and Node (`tsconfig.json:4,17`) while the Worker uses Workers types.
- **Runtime edges.** Wrangler `alias` [wrangler-config] replaces the package specifiers in the compatibility table. App source is not forked. B2 checks esbuild's alias handling of subpaths (`workflow` vs `workflow/api`) and pins the exact targets.
- **Database.** The Worker uses `pg` (node-postgres) with `drizzle-orm/node-postgres`. Each invocation or Workflow step creates `new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5 })` and ends it with `ctx.waitUntil(pool.end())`. A `Pool` (not a single `Client`) keeps today's behavior where `db.transaction` gets its own connection while other queries proceed. `max: 5` stays under the six connections per invocation that may wait for a response [workers-limits].
- **Service-role seam.** `supabase/service-role.ts` gains a scoped provider (AsyncLocalStorage). Inside a Worker invocation, the existing `db` export resolves to that invocation's client; everywhere else it stays the lazy Postgres.js singleton. `SERVICE_ROLE_DB_MARKER` (`supabase/service-role.ts:104-117`) keeps working. This keeps domain modules that import `db` directly (for example `src/features/jobs/queue.ts:32`) unchanged.
- **Driver-neutral queries.** `DbClient` (`src/lib/db/types.ts:1-4`) is typed from `drizzle-orm/postgres-js`. B2 retypes it to Drizzle's driver-neutral Postgres database type and routes every `execute()` result through one helper, because node-postgres returns `{ rows }` while call sites cast to arrays today (`src/lib/db/queries/admin/retention.ts:18-26`, `email-delivery-content.ts:34`, `module-lesson-generation.ts:513`, `user-preferences.ts:142-289`, `plan-list.ts:265-285`). This lands in B2, before B3a's retention job needs it.
- **Dependencies B2 requests** (the orchestrator owns `package.json`): `wrangler`, `@sentry/cloudflare@10.70.0`, `pg` (at least 8.16.3 for Hyperdrive [hd-supabase]), `@types/pg`.
- **Tests.** Worker handler logic is tested with the existing Vitest setup (`tests/unit/workers/jobs/**`, Node, mocked bindings). The shared query layer's DB-backed tests gain a node-postgres run on the native test stack. Workers-runtime behavior is proven on staging, not by a second test harness.
- **Bundle gate (every phase).** `wrangler deploy --dry-run --outdir <tmp> --env staging` [wrangler-cmds], then fail if the output contains `next/`, `@vercel/`, `@clerk/`, or the Vercel `workflow` runtime.

### Evidence

- Workers Builds runs commands in the configured root directory, and the Wrangler file there must carry the Worker's name (environment suffixes are matched automatically) [builds-config][builds-troubleshoot]. Monorepos set one root directory per Worker [builds-monorepo]. Workers Builds ignores Wrangler custom builds [builds-config].
- Cloudflare: "Pairing Drizzle ORM with the Postgres.js driver over Hyperdrive is not currently supported. Switch your driver to node-postgres" [hd-drizzle]. The mechanism is visible in this repo: drizzle-orm 0.45.2 calls `client.unsafe(query, params)` without options (`node_modules/drizzle-orm/postgres-js/session.js:33,43,65,103,106`), and postgres 3.4.9 defaults `unsafe` to `prepare: false` (`node_modules/postgres/src/index.js:119-123`). Hyperdrive warns that `prepare: false` with Postgres.js "can cause queries to hang or fail intermittently" [hd-postgresjs].
- Clients must be per request: "Create a new database client on every request instead of caching it in a global variable" [hd-troubleshoot].
- Hyperdrive pools in transaction mode; `SET` lasts one query or transaction [hd-pooling]. Job code only uses transaction-local state: `set_config(…, true)` and `pg_advisory_xact_lock` (`src/lib/db/queries/helpers/plan-lifecycle-lock.ts:14-18`, `plan-generation-status.ts:40`, `rls-jwt-claims.ts:51`). The RLS client's session-level `SET ROLE` (`supabase/rls.ts:101-123`) would not survive pooling, so the Worker never imports it. Jobs use the service-role client by design (`supabase/service-role.ts:8-15`).

### Alternatives rejected

- **Keep Postgres.js + Drizzle and force `prepare: true` with a wrapper around `unsafe()`.** Cloudflare marks the pairing unsupported; a wrapper relies on undocumented behavior and would fail intermittently, not loudly.
- **Skip Hyperdrive and connect Postgres.js straight to Supavisor.** Every invocation would pay TLS and SCRAM setup against a 10 ms CPU budget, and it contradicts the decided Hyperdrive design.
- **Move the whole app to node-postgres.** Not needed for Track B; Vercel keeps Postgres.js. Revisit only if running two drivers causes drift.
- **Make `workers/jobs` a pnpm workspace package.** `pnpm-workspace.yaml` has no `packages` list today, so this converts the repo into a workspace for no gain: the Worker imports root `src/` either way.
- **Build with Vite and `@cloudflare/vite-plugin`.** Sentry recommends it because it instruments bundled DB and AI clients at build time [sentry-cf], but it replaces `wrangler dev` with `vite dev` and adds a build layer. Switch if DB and AI spans in Sentry become necessary.

### Open risks

- `src/lib/config/env/shared.ts:331-332` runs environment assertions at import time. B2 confirms `process.env` is populated at global scope in the deployed Worker.
- The `execute()` normalization also changes app query paths; existing integration tests cover them and must run on both drivers.
- Installed Zod is 4.4.3; Cloudflare advises 4.5.0 or later because earlier versions use much more memory per schema [workers-limits]. Watch for `exceededMemory` before deciding on an upgrade.

## Decision 2: Environments

### Decision

| | Local (top level) | `staging` | `production` |
| --- | --- | --- | --- |
| Worker name | `atlaris-jobs` (never deployed) | `atlaris-jobs-staging` | `atlaris-jobs-production` |
| Workers Builds branch | — | `feature/jcs-120-move-atlaris-background-jobs-to-cloudflare-workers` until Track B first merges into `develop`, then `develop` | `main` |
| Supabase project | Worktree native stack (Track A) | `atlaris-dev` | `atlaris-prod` |
| Hyperdrive config (binding `HYPERDRIVE`) | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | `atlaris-jobs-db-staging` | `atlaris-jobs-db-production` |
| Regeneration queue (binding `REGENERATION_QUEUE`) | emulated by `wrangler dev` | `atlaris-regeneration-staging` | `atlaris-regeneration-production` |
| Workflows | local | `atlaris-email-delivery-staging`, `atlaris-module-lessons-staging`, `atlaris-plan-generation-staging` | same names with `-production` |
| Worker Cron Triggers | none | `*/15 * * * *`, `0 3 * * *` | `*/15 * * * *`, `0 3 * * *` |
| Public hostname (`JOBS_WORKER_URL` in the app) | `http://127.0.0.1:<port>` | `https://workers-staging.atlaris.app` | `https://workers.atlaris.app` |
| `workers.dev` | — | disabled (`workers_dev: false`) | disabled (`workers_dev: false`) |
| `APP_URL` | local app URL | `https://staging.atlaris.app` | `https://atlaris.app` |
| Sentry environment | `development` | `staging` | `production` |

- **Staging deploy branch (decided 2026-10-05).** Track B PRs merge into the parent branch `feature/jcs-120-move-atlaris-background-jobs-to-cloudflare-workers`, and Workers Builds deploys only from the configured production branch [builds-branch]. The staging Worker's production branch is therefore the Track B parent branch until Track B first merges into `develop`; the user then switches it to `develop` under **Settings** → **Build** → **Branch control**.
- **Database role (decided 2026-10-05).** Both Hyperdrive configurations connect as `postgres`, matching the service-role client the jobs use today (`supabase/service-role.ts:52-55`). A least-privilege job role is a possible follow-up outside Track B: it needs a migration and a privilege audit, because retention calls a `SECURITY DEFINER` function revoked from `anon` and `authenticated` (`supabase/migrations/20260522223908_schedule_retention_cleanup.sql:34-35`).
- **Public endpoint (decided 2026-10-05).** Each Worker is served on a Workers Custom Domain in the `atlaris.app` zone: `workers-staging.atlaris.app` → `atlaris-jobs-staging`, and `workers.atlaris.app` → `atlaris-jobs-production`. `workers.dev` is off on both (`workers_dev: false`).
  - **Why the whole zone moves.** A Custom Domain needs an active Cloudflare zone; Cloudflare then creates the DNS record and certificate itself, and it refuses a hostname that already has a CNAME record or sits in a zone you do not own [custom-domains]. A CNAME from Vercel DNS to `workers.dev` is therefore not an option. Cloudflare's subdomain setup (a zone for `jobs.atlaris.app` alone) is Enterprise-only [dns-subdomain]. So the entire `atlaris.app` zone moves to Cloudflare on the Free plan; a full setup is the only one Free supports [dns-full-setup].
  - **What changes and what does not.** Only the nameservers change at the registrar (Squarespace; today `ns1.vercel-dns.com` and `ns2.vercel-dns.com`). Vercel keeps hosting the app. Every record that points at Vercel stays **DNS only** (grey cloud), so app traffic is not proxied through Cloudflare [dns-full-setup].
  - **Side benefit.** The zone's single Free rate-limiting rule can protect `/v1/*` on the Worker hostnames (Decision 4).
  - **Order.** The zone move is checklist Part A0 and must be active before B2's first deploy.
- **B2 sequencing.** `wrangler.jsonc` ships with `"workers_dev": false` and one custom-domain route per environment (`{ "pattern": "<host>", "custom_domain": true }` [custom-domains]). Wrangler treats its routes as the source of truth and overrides dashboard route edits on the next deploy [wrangler-config], so the deploy attaches the domain. The checklist only verifies it, or attaches it by hand if the token lacks permission. Every `/healthz` check uses the custom hostnames. B2's first deploy needs the `atlaris.app` zone **Active** in Cloudflare (checklist A0) and no existing `workers` or `workers-staging` records.
- Supabase project names come from Track A's environment table (`docs/development/local-database.md` on `feature/jcs-119-…`): staging is `atlaris-dev`, production is `atlaris-prod`. Staging is the `develop` Vercel Preview with non-production services (`docs/ci-cd/pipeline-and-deployment-strategy.md:36`).
- Bindings, variables, queues, Workflows, and `secrets` are non-inheritable and are written out per environment; `triggers` is inheritable, so the top level declares no crons [wrangler-config].
- Workflow names are account-wide, so each carries the environment suffix (max 64 characters [wf-limits]).
- Non-secret variables live in `wrangler.jsonc` per environment: `NODE_ENV=production` (staging and production; the app's env modules read it at runtime through `process.env`), `WORKER_ENV`, `APP_URL`, `SENTRY_DSN` (the `atlaris-jobs` project's DSN, the same value in both environments; a DSN is not a secret), `LOG_LEVEL`, `RESEND_FROM`, `RESEND_REPLY_TO`, and the AI tuning variables the app sets in the same Vercel environment (B4/B5 list them).
- Secrets per environment (created in B1; listed with `secrets.required` so a deploy fails if one is missing [wrangler-config]): `JOBS_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`. Each phase adds a secret to `secrets.required` only when its code reads it. There is no `POSTGRES_URL` secret: the database credential lives only in the Hyperdrive configuration.
- Dashboard-managed job switches (Decision 7) are not in `wrangler.jsonc`; `keep_vars: true` keeps them across Git deploys [wrangler-cmds].

Illustrative `wrangler.jsonc` shape (B2 owns the real file):

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "atlaris-jobs",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-05",
  "tsconfig": "./tsconfig.json",
  "keep_vars": true,
  "workers_dev": false,
  "preview_urls": false,
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "alias": { "@sentry/nextjs": "@sentry/cloudflare" /* plus the runtime/ targets B2 verifies */ },
  "env": {
    "staging": {
      "routes": [{ "pattern": "workers-staging.atlaris.app", "custom_domain": true }],
      "vars": { "NODE_ENV": "production", "WORKER_ENV": "staging", "APP_URL": "<staging app URL>", "SENTRY_DSN": "<atlaris-jobs DSN>", "LOG_LEVEL": "info" },
      "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<staging Hyperdrive ID>" }],
      "queues": {
        "producers": [{ "binding": "REGENERATION_QUEUE", "queue": "atlaris-regeneration-staging" }],
        "consumers": [{ "queue": "atlaris-regeneration-staging", "max_batch_size": 1, "max_batch_timeout": 0, "max_retries": 3, "max_concurrency": 2 }]
      },
      "workflows": [
        { "name": "atlaris-email-delivery-staging", "binding": "EMAIL_DELIVERY_WORKFLOW", "class_name": "EmailDeliveryWorkflow", "schedules": ["0 14 * * *", "30 14 * * MON"] },
        { "name": "atlaris-module-lessons-staging", "binding": "MODULE_LESSONS_WORKFLOW", "class_name": "ModuleLessonsWorkflow" },
        { "name": "atlaris-plan-generation-staging", "binding": "PLAN_GENERATION_WORKFLOW", "class_name": "PlanGenerationWorkflow" }
      ],
      "triggers": { "crons": ["*/15 * * * *", "0 3 * * *"] },
      "version_metadata": { "binding": "CF_VERSION_METADATA" },
      "secrets": { "required": ["JOBS_SIGNING_SECRET"] }
    },
    "production": { /* same keys with -production names, the production Hyperdrive ID, and
                       "routes": [{ "pattern": "workers.atlaris.app", "custom_domain": true }] */ }
  }
}
```

With compatibility date 2026-08-04 or later, `nodejs_compat` is on by default [process]. Each binding is added by the phase that first uses it; B2 starts with `HYPERDRIVE`, the `*/15` cron, and `CF_VERSION_METADATA`.

### Local development loop

1. `pnpm db start` (Track A) starts the worktree's native Supabase stack and writes `POSTGRES_URL` into the worktree `.env.local`; ports are dynamic (20000–32767).
2. The Worker dev script (B2) reads that `POSTGRES_URL`, refuses non-local hosts (same rule as `pnpm db start`), exports it as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, and runs `wrangler dev` at the top level on a per-worktree port. With a local connection string, the Worker connects straight to the database and Hyperdrive pooling and caching do not apply [hd-local].
3. Local secrets go in `workers/jobs/.dev.vars` (gitignored); with `secrets.required` set, only the listed keys load [env-local]. Local AI runs with `AI_PROVIDER=mock`.
4. Crons: `curl "http://127.0.0.1:<port>/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"` [cron-triggers]. Workflows: `wrangler workflows trigger <name> --local` or Local Explorer [wf-local]. Queues run under `wrangler dev` (delay settings need Wrangler 3.38.0 or later) [queues-batching].
5. The local app reaches the local Worker through `JOBS_WORKER_URL=http://127.0.0.1:<port>` and the same `JOBS_SIGNING_SECRET` in `.env.local` and `.dev.vars`.
6. Never use `wrangler dev --remote`; it runs against deployed resources and real data [hd-local].

Codex and Cursor Cloud agents use the same loop after `pnpm db agent up`, which writes the loopback `POSTGRES_URL`. B2 confirms `wrangler dev` (workerd) runs on one Codex and one Cursor Cloud VM.

### Alternatives rejected

- **A `dev` Cloudflare environment.** Local `wrangler dev` covers development, and every deployed environment costs Cron Triggers from the shared limit of 5.
- **Hyperdrive to the Supavisor transaction pooler (port 6543).** Hyperdrive already pools in transaction mode; stacking two transaction poolers adds prepared-statement problems for no gain.

### Open risks

- Supabase Free direct connections (`db.<ref>.supabase.co:5432`) are IPv6-only; the shared session pooler (port 5432 on the pooler host) is IPv4 [supabase-connect]. Cloudflare's Supabase guide says to use the direct string [hd-supabase] but does not say whether Hyperdrive reaches IPv6-only origins. Hyperdrive tests the connection when the config is created, so B1 tries direct first and falls back to the session pooler.
- Hyperdrive caches eligible reads for 60 seconds by default and does not invalidate on writes [hd-caching]. Job claims and status reads must be fresh, so both configs are created with caching disabled.
- **The DNS move is outward-facing.** The Cloudflare quick scan is not guaranteed to find every record [dns-full-setup], so a missed record breaks the app, email, or a verification. Checklist A0 compares the full Vercel record list before the nameserver change.
- **Wildcard records.** On 2026-10-05, Vercel's authoritative nameserver answered an arbitrary name (`zz-random-123.atlaris.app`) with the same Vercel IPs as the apex, which points to a wildcard record or a `*.atlaris.app` project domain.
  - If a project uses a wildcard domain, Vercel needs DNS challenges to renew its certificate. With DNS elsewhere, that means delegating `_acme-challenge` to `ns1.vercel-dns.com` and `ns2.vercel-dns.com` [vercel-domains].
  - A0 checks for this before the switch.
- **DNSSEC.** On 2026-10-05 no DS record was published for `atlaris.app`. DNSSEC must be off at the registrar before nameservers change [dns-full-setup]; A0 re-checks.

## Decision 3: Configuration loading

### Decision

1. **Same names.** Worker variables and secrets use the app's environment names (`OPENROUTER_API_KEY`, `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`, `APP_URL`, `NODE_ENV`, `LOG_LEVEL`, …).
2. **No copying.** Since compatibility date 2025-04-01, `process.env` holds the Worker's variables, secrets, and version metadata (`nodejs_compat_populate_process_env`) [process]. `getProcessEnvSource()` (`src/lib/config/env/shared.ts:35-37`) therefore sees them, and every existing env module (`ai.ts`, `app.ts`, `email.ts`, `maintenance.ts`, `queue.ts`, …) keeps doing its own parsing and validation unchanged.
3. **One Worker-only module.** `workers/jobs/src/env.ts` validates only what the app does not have: the `HYPERDRIVE`, queue, Workflow, and `CF_VERSION_METADATA` bindings (objects, not strings, so never in `process.env`); `JOBS_SIGNING_SECRET`; and the switch variables. Handlers pass the typed `env` down; deep code that needs a binding may use `import { env } from "cloudflare:workers"` [bindings].

### Evidence

- `process.env` population and the warning not to replace the `process.env` object: [process]. Global-scope `env` access: [bindings].
- `createServerEnvAccess` caches values per isolate in production (`src/lib/config/env/shared.ts:178-239`). Changing a secret or variable deploys a new version [secrets], which starts new isolates, so cached values do not go stale.
- `process.env.NODE_ENV` is replaced at build time (`production` for `wrangler deploy`, `development` for `wrangler dev`) [bundling], but `parseNodeEnv` reads it through `process.env` at runtime (`src/lib/config/env/shared.ts:65-78`). That is why `NODE_ENV` is also a Worker variable.

### Alternatives rejected

- **Copy `env` into `process.env` on each request.** Unnecessary with automatic population; Cloudflare advises against replacing `process.env` because the object is shared by the isolate [process].
- **Refactor every env module to take an `EnvSource`.** Large churn with no behavior gain.
- **A Worker copy of the env schemas.** Duplicates validation the app already owns.

### Open risks

- Variables are 5 KB each and 64 per Worker on Free [workers-limits]; ample for this list.

## Decision 4: App ↔ Worker contract

### Decision

- **Transport.** The app calls `POST {JOBS_WORKER_URL}/v1/<command>` over HTTPS with a JSON body `{ "v": 1, …payload }`. `JOBS_WORKER_URL` is the Worker's custom domain for that environment: `https://workers-staging.atlaris.app` (Vercel Preview, `develop` only) or `https://workers.atlaris.app` (Production). See Decision 2.
- **Signature.** Headers `x-atlaris-jobs-timestamp: <unix seconds>` and `x-atlaris-jobs-signature: v1=<hex>`, where `<hex>` is HMAC-SHA256 with `JOBS_SIGNING_SECRET` over `<timestamp>.<METHOD>.<path>.<hex SHA-256 of body>`.
- **Verification.** The Worker rejects timestamps more than 300 seconds off, compares in constant time (same digest-compare approach as `workflowCallbackTokensMatch`, `src/lib/proxy/workflow-callback-auth.ts:81-99`), accepts an optional `JOBS_SIGNING_SECRET_PREVIOUS` during rotation, and returns `401` with no detail on failure. Both runtimes have Web Crypto.
- **Commands.**

  | Command | Phase | Payload (besides `v`) | Worker action | Idempotency |
  | --- | --- | --- | --- | --- |
  | `GET /healthz` | B2 | — | `{ ok: true, versionId }`; no auth, no data | — |
  | `POST /v1/email-delivery/runs` | B3b | `runKind`, `schedulerDateUtc`, `action` | Starts the email Workflow for manual `start`/`resume`/`replay_reviewed` (the app's manual route forwards to it) | DB run key `(run_kind, scheduler_date_utc)` |
  | `POST /v1/regeneration/enqueue` | B4 | `jobId` | `REGENERATION_QUEUE.send({ v: 1, jobId })` | CAS claim on the `job_queue` row in the consumer |
  | `POST /v1/module-lessons/start` | B5 | `planId`, `moduleId`, `userId`, `batchRequestId`, `correlationId` | `MODULE_LESSONS_WORKFLOW.create({ id: "lessons-<moduleId>-<batchRequestId>", params })` | Workflow instance ID |
  | `POST /v1/plan-generation/start` | B6 | `planId`, `userId`, `attemptId`, serialized reservation, `correlationId` | `PLAN_GENERATION_WORKFLOW.create({ id: "plan-<attemptId>", params })` | Workflow instance ID |

- **Responses.** `202 { accepted: true, instanceId }`; `200 { accepted: true, duplicate: true }` when the instance already exists (`create` throws for an ID still within retention [wf-api]); `400` invalid body; `401` bad signature; `503 { code: "jobs_paused" | "job_disabled" }`; `5xx` transient.
- **App handling.** Timeout 10 seconds, no automatic retry. Every non-2xx response goes to the start-failure branch that exists today: lessons revert the provisional claim and return 502/503; regeneration leaves the job `pending` for the sweep; plan create/retry settles the reserved attempt as a retryable failure, as `create-workflow-backed-process-generation.ts:105-118` does now.
- **Status is DB-only.** The app keeps reading `GET /api/v1/plans/:planId/status` (`getPlanGenerationStatusSnapshot`), the lesson status route, and `job_queue`. The Worker writes Cloudflare instance IDs into the existing correlation fields (`generation_attempts.metadata.workflow`, `modules.lessonGenerationMetadata.workflow.runId`, `email_notification_delivery_runs.workflow_run_id`, `job_queue.payload.workflow`), with a runtime marker added by the phase that changes each field. The app never calls Cloudflare APIs.
- **Plan create/retry (B6).** SSE carries no progress while AI work runs: `executeLifecycleGenerationStream` awaits `processGeneration()` (`src/features/plans/session/stream-emitters.ts:198`) and only then emits `module_summary`, `progress`, and `complete` (`:210-220`). The client already navigates as soon as it has the plan ID (`onPlanIdReady`, `src/features/plans/session/usePlanGenerationSession.ts:308`). So `POST` create returning `{ planId }` plus the existing status polling loses nothing users see. Rate limits, plan creation, and attempt reservation stay in the app route, matching `create-workflow-backed-process-generation.ts:63-87`, which then sends `plan-generation/start`.

### Evidence

- Vercel cannot hold a Queue producer binding. The HTTP alternatives (Queues HTTP publish, Workflows REST API) need a Cloudflare API token with `Queues Edit` [queues-http].
- Service bindings only connect Workers to Workers [workers-limits].
- Workflow instance IDs are unique per Workflow; `create` throws on reuse, `createBatch` skips existing IDs [wf-api][wf-rules].

### Alternatives rejected

- **Publish to the Queue or start Workflows from Vercel with Cloudflare's REST API.** Stores an account-level Cloudflare API token in Vercel, against the credential policy that made Workers Builds the deploy path (parent issue), and leaves no place to validate commands or accept two command shapes during a change.
- **Static bearer token** (today's internal-route pattern). Simpler, but anyone holding the token can forge commands for any user. HMAC over timestamp and body limits a captured request to replaying that same idempotent command for five minutes. Because every command is idempotent, bearer-over-TLS is the fallback if reviewers want parity with existing routes.
- **Worker → app callbacks for status.** Not needed: status is in the database.

### Open risks

- **Public endpoint.** The Worker hostnames are public. Unauthenticated requests are rejected but still count toward the Free limit of 100,000 requests per day, which Workflow executions share [workers-limits][wf-limits], so a flood could stop every job until midnight UTC.
  - **Mitigation (decided 2026-10-05).** Serve the Workers only on their custom domains, with `workers.dev` off, and add the zone's one Free-plan rate-limiting rule on paths starting with `/v1/`.
  - **What Free allows** [waf-rl]: 1 rule; path and verified-bot fields only; per-IP counting; a 10-second counting period; a 10-second mitigation.
  - **Proposed rule:** `jobs-worker-v1`, URI path starts with `/v1/`, more than 100 requests in 10 seconds per IP → Block for 10 seconds. The threshold stays high because every legitimate command comes from Vercel's shared egress IPs.
  - **Scope.** The Free rule cannot match on host, so it covers `/v1/` on every proxied hostname in the zone, which means both Worker hostnames. App hostnames are DNS-only and never pass through it.
  - **Residual risk.** On Free the rule mitigates but does not eliminate a distributed flood: many IPs each staying under the threshold still reach the Worker. Workers Paid (no daily request cap) removes the exposure; revisit at the post-B5 Paid decision.
  - Switching endpoints later is Wrangler configuration, DNS, and the app's `JOBS_WORKER_URL`, not code.
- Clock skew over 300 seconds between Vercel and Cloudflare would reject commands (unlikely).

## Decision 5: Observability

### Decision

- **Sentry (decided 2026-10-05: separate project).** `@sentry/cloudflare` with `withSentry` on the entry and `instrumentWorkflowWithSentry` on each Workflow class [sentry-wrangler], reporting to a new project `atlaris-jobs` in org `jcs-software`. The app keeps its own project (`jcs-software/atlaris`, `next.config.ts:120-122`). Tag events `runtime: cloudflare-worker`.
  - The DSN is the Worker variable `SENTRY_DSN`, set in `wrangler.jsonc` per environment. Both environments use the same DSN; a DSN is not a secret.
  - `environment` (`staging` or `production`) separates the two Workers inside the project.
  - `release` comes from `SENTRY_RELEASE`, set at deploy time with `--var SENTRY_RELEASE:$WORKERS_CI_COMMIT_SHA` [wrangler-cmds][builds-config]; the SDK reads `SENTRY_RELEASE` first, then `CF_VERSION_METADATA.id` [sentry-cf]. B2 uses the same commit-SHA format as the app's release, so a Worker release and an app release from one commit can be matched by SHA across the two projects.
  - Reuse `beforeSendSentryEvent` (`src/lib/observability/sentry-filters.ts`) and keep `sendDefaultPii` off, as on the server today.
- **Cron monitors.** The slugs `plan-cleanup-maintenance` (`src/app/api/internal/maintenance/plans/cleanup/route.ts:6-15`) and `email-notification-delivery-daily`/`-weekly` (`src/features/notifications/email/delivery-monitor.ts:5-24`) are created in `atlaris-jobs` by the Worker's first check-in with monitor config [sentry-crons]. Sentry environments keep staging and production apart. Add `retention-cleanup`, which `pg_cron` never had. During each observation window the app project's monitor (old owner) and the `atlaris-jobs` monitor (new owner) exist side by side; the old one is removed with its owner in B7. `withMonitor` and `captureCheckIn` work in Workers [sentry-crons].
- **Workers Logs.** `observability.enabled: true`. The logger writes JSON to the console, which Workers Logs indexes [workers-logs]. Invocation logs include CPU time and wall time [workers-limits].
- **Workflows.** The Workflows dashboard (instance list, status, step history) replaces Vercel workflow observability. Correlate through the instance ID stored in Postgres (Decision 4). Sentry derives a deterministic trace ID from the instance ID [sentry-workflows].
- **Source maps.** Workers Builds uploads them to the `atlaris-jobs` project with a `SENTRY_AUTH_TOKEN` build secret (B2; created in B1 with access to that project).

### Evidence

- Workers Logs on Free: 200,000 events per day, 3-day retention; pricing moves to Cloudflare Observability pricing on December 1, 2026 [workers-logs].
- Tail Workers need Workers Paid [tail-workers], so they are not used.
- `performance.now()` and `Date.now()` only advance after I/O in Workers, so CPU-bound spans show 0 ms [sentry-cf]. In-code timers cannot measure CPU (Decision 9).

### Alternatives rejected

- **Same Sentry project as the app, filtered by a runtime tag.** Rejected by user preference for separate issue streams and quotas. The cost is that one commit's release appears in two projects, matched by SHA.
- **Logpush or OpenTelemetry export.** No destination needs it yet; Workers Logs plus Sentry cover current runbooks.

### Open risks

- Without the Vite plugin, Sentry gets no automatic spans for Postgres or OpenRouter calls [sentry-wrangler] (see Decision 1 alternatives).
- 200,000 log events per day are shared by both environments; B2 sets `head_sampling_rate` if staging traffic grows.

## Decision 6: Deploy ordering and rollback

### Decision

Ordering rule for any change that crosses the database, the Worker, and the app:

1. **Expand migration first.** Dispatch the expand migration for the target environment (`.github/workflows/staging-db-migrations.yaml:4-16`, operator-dispatched) before Worker or app code that uses the new schema reaches that environment's branch (existing rule: `docs/development/deploy.md`).
2. **Worker second.** Merge the Worker change that accepts the new command or message shape and still accepts the old one. Confirm in Workers Builds that the deploy succeeded and the new version is active.
3. **App third.** Merge the app change that sends the new shape.
4. **Contract last.** Remove old-shape handling and run contract migrations only after old app deployments have drained, the old Worker version is gone, and every in-flight item carrying the old shape has finished: queue messages live at most 24 hours on Free [queues-limits], Workflow instance state up to 3 days on Free [wf-limits].

Vercel and Workers Builds both deploy on the same push, so steps 2 and 3 must be separate merges. A single PR that changes both ends of a command contract is not mergeable.

Workflow code rules: Workflows re-run `run()` from the top when they resume and skip completed steps [sentry-workflows][wf-rules]. Never rename, remove, or reorder `step.do` names in a deployed Workflow class while instances may be in flight; add steps instead. A breaking change ships as a new Workflow class and name (`…-v2`), and the old one drains.

### Rollback per phase

| Phase | Fast rollback | Durable rollback | Notes |
| --- | --- | --- | --- |
| B2 | Workers dashboard → Deployments → Rollback [rollbacks] | Revert PR | No user-facing work yet |
| B3a | Switch off; restore the old owner (GitHub variable `PLAN_CLEANUP_ENABLED=true`; rerun the `cron.schedule` statement from the retention migration) | Revert PR | Old owners stay until B7 |
| B3b | Switch off; Vercel Flag `email-notification-delivery` on | Revert PR | The run key `(run_kind, scheduler_date_utc)` and the delivery ledger prevent duplicate sends (`docs/architecture/email-notification-delivery-runbook.md`) |
| B4 | Switch off (consumer retries with delay, then drops; rows stay `pending`); Vercel Instant Rollback of the app; GitHub variable `REGENERATION_QUEUE_ENABLED=true` | Revert PR | `job_queue` CAS claims stop double processing |
| B5 | Switch off (running instances revert their claim, as on a flag drop today); Vercel Instant Rollback | Revert PR | |
| B6 | Vercel Instant Rollback (restores the stream route and its client bundle); switch off | Revert PR | Running instances finish; attempts settle through lifecycle finalization |
| B7 | Revert PR | Revert PR | Deleted schedulers come back from Git; old owners must be re-enabled by hand |

A Workers rollback restores code only; bindings and connected resources do not change, and it is limited to the last 100 versions [rollbacks]. The next push to the production branch redeploys the head, so a fast rollback is always followed by a revert PR.

### Alternatives rejected

- **Deploy the Worker from CircleCI or GitHub Actions to enforce order.** Puts Cloudflare credentials into CI, which the parent issue rules out.
- **Gradual deployments.** They split HTTP traffic between versions [gradual]; most of this Worker's work comes from crons, queues, and Workflows, so a split adds ambiguity without protection.

### Open risks

- Cloudflare's Workflows pages read for this note do not describe what happens to an in-flight instance when a new version deploys beyond the replay rule above. B5 tests a deploy during a sleeping instance on staging.

## Decision 7: Cutover and pause

### Decision

**Switches.** Each job has a Worker variable `JOB_<NAME>_ENABLED` (`PLAN_CLEANUP`, `RETENTION_CLEANUP`, `EMAIL_DELIVERY`, `REGENERATION`, `MODULE_LESSONS`, `PLAN_GENERATION`). It is off unless set to `true`, parsed with the app's `toBoolean` rules (`src/lib/config/env/shared.ts:116-129`).

- `JOBS_PAUSED=true` pauses everything. When absent, jobs are not paused.
- Switches are plain-text variables managed only in the dashboard (Worker → Settings → Variables and Secrets), never in `wrangler.jsonc`. With `keep_vars: true`, Git deploys leave them alone [wrangler-cmds], and saving a variable deploys a new version immediately [env-vars].
- The `flags/next` alias resolves the app's flag keys to these switches: `email-notification-delivery` → `JOB_EMAIL_DELIVERY_ENABLED`; `module-lesson-generation` → `JOB_MODULE_LESSONS_ENABLED`; `maintenance-mode` → always `false`.

**When paused or disabled:**

| Handler | Behavior |
| --- | --- |
| `fetch` commands | `503 jobs_paused` or `503 job_disabled` |
| `scheduled` | Logs and returns without work. Sentry then reports missed check-ins, which is the reminder that jobs are paused |
| `queue` | `retryAll({ delaySeconds: 900 })` [queues-batching]. Exhausted messages drop, the rows stay `pending`, and the sweep re-sends them after resume |
| Workflow steps that call OpenRouter or Resend | Check the switch before the call. Email marks the run `paused` (existing state, resumed with the manual `resume` action); lessons revert the claim (existing flag-drop behavior); plan and regeneration attempts fail as retryable |

**`MAINTENANCE_MODE` does not reach the Worker, by design.** App maintenance is an env value plus the Vercel Flag `maintenance-mode` (`src/proxy.ts:128-129`, `src/lib/proxy/maintenance-mode.ts`) and controls user traffic. The Worker cannot read Vercel env values or Vercel Flags (see the `@vercel/flags-core` row in the audit). While the app is in maintenance no new commands arrive; for database maintenance the operator also sets `JOBS_PAUSED=true`. Today's behavior is inconsistent: the plan cleanup route is redirected during maintenance while the regeneration drain and email cron are exempt (`docs/architecture/internal-worker-routes.md`, Middleware). A single explicit pause replaces that.

**Cutover sequence, per job:**

1. Merge the job code with its switch absent (off) in both environments.
2. Staging: disable the staging old owner, if one exists, then set the switch to `true` and verify one full run.
3. Production, with explicit user approval at this step (parent issue boundary): disable the old owner, then set the switch to `true` minutes later, then watch the first run. Never run both owners.
4. Observe for the job's window (decided 2026-10-05, below), then B7 deletes the old owner.

| Job | Observation window |
| --- | --- |
| Plan cleanup | 7 days |
| Retention cleanup | 7 daily runs |
| Email delivery | 14 days (two weekly runs) |
| Regeneration, module lessons, plan create/retry | 7 days and at least 20 production jobs each |

| Job | Disable old owner | Enable new owner |
| --- | --- | --- |
| Plan cleanup | GitHub repo variable `PLAN_CLEANUP_ENABLED=false` (`.github/workflows/plan-cleanup-scheduler.yml:17`) | `JOB_PLAN_CLEANUP_ENABLED=true` |
| Retention | `SELECT cron.unschedule('retention-cleanup');` per environment (retention runbook). B3a also ships it as a migration so new databases match | `JOB_RETENTION_CLEANUP_ENABLED=true` before the next 03:00 UTC |
| Email | Vercel Flag `email-notification-delivery` off (stops the cron route before it reserves work) | `JOB_EMAIL_DELIVERY_ENABLED=true` |
| Regeneration | GitHub repo variable `REGENERATION_QUEUE_ENABLED=false`, then deploy the app version that enqueues through the Worker | `JOB_REGENERATION_ENABLED=true` before that app deploy |
| Module lessons | Deploy the app version that starts lessons through the Worker | `JOB_MODULE_LESSONS_ENABLED=true` before that app deploy |
| Plan create/retry | Deploy the app version with the new create route | `JOB_PLAN_GENERATION_ENABLED=true` before that app deploy |

**Phase dependency (decided 2026-10-05).** B4's production cutover follows B5's CPU gate and lessons cutover. Regeneration finalization starts lesson generation for the first two modules (`src/features/plans/lifecycle/generation-finalization/store.ts:151`). Before B5 the Worker has nothing to start them with, so B4 injects a starter that skips and logs; on staging that gap is acceptable. Waiting for B5 keeps regenerated plans in production from losing pre-generated lessons and puts the Workers Paid decision ahead of the first AI job in production. B4 is still built and observed on staging in wave 2.

### Alternatives rejected

- **Evaluate Vercel Flags in the Worker.** `@vercel/flags-core` imports `@vercel/oidc`, `@vercel/functions`, and `next/cache` and has not been shown to run on workerd. It would also add a Vercel API call to every check.
- **Switches in `wrangler.jsonc` vars.** Each change would need a PR and a build, too slow for an emergency stop.
- **A database switch table.** Needs a migration and an operator path for a capability the dashboard variable already gives.
- **Removing Cron Triggers in the dashboard to pause.** Wrangler manages triggers and restores them on the next deploy [cron-triggers].

## Decision 8: Cron budget and regeneration

### Decision: schedules

| Trigger | Mechanism | Expression | Environments | Jobs |
| --- | --- | --- | --- | --- |
| 1, 2 | Worker Cron Trigger | `*/15 * * * *` | staging, production | Plan cleanup; regeneration sweep (from B4); B2's heartbeat until B3a |
| 3, 4 | Worker Cron Trigger | `0 3 * * *` | staging, production | Retention cleanup |
| — | Workflow `schedules` on the email Workflow | `0 14 * * *`, `30 14 * * MON` | staging, production | Email daily and weekly |

- Worker Cron Triggers used: **4 of 5 per account**. Workflow schedules used: 4 of 100 per account [wf-limits][wf-trigger].
- One `scheduled()` handler switches on `controller.cron` [scheduled].
- The email Workflow reads `event.schedule.cron` and `event.schedule.scheduledTime` to derive `runKind` and `schedulerDateUtc` [wf-api]. Its first step claims the logical run on the existing `(run_kind, scheduler_date_utc)` key, so a duplicate firing exits without sending, as with Vercel Cron today.
- Monday is written `MON`: Cloudflare numbers weekdays from 1 = Sunday [cron-triggers].

**Fallback** if Workflow `schedules` turn out to be unavailable on Free or to count against the Cron Trigger limit (B3b checks before relying on them): production keeps four Worker crons (`*/15`, `0 3`, `0 14 * * *`, `30 14 * * MON`); staging keeps only `*/15`, runs retention when `scheduledTime` is 03:00 UTC, and triggers email with the signed manual command. Total: 5 of 5.

### Decision: regeneration uses a Cloudflare Queue

The app inserts the `job_queue` row as today, then sends `POST /v1/regeneration/enqueue { jobId }`. The Worker puts `{ v: 1, jobId }` on `atlaris-regeneration-<env>`.

**Consumer.** Settings: `max_batch_size: 1`, `max_batch_timeout: 0`, `max_retries: 3`, `max_concurrency: 2`. It runs the job inline, using the same steps as `planRegenerationWorkflow`: claim (CAS), reserve attempt, process, finalize. Retry-after rate limits use `msg.retry({ delaySeconds })`, up to 24 hours [queues-batching]. The consumer then acknowledges the message.

**Source of truth.** `job_queue` stays the durable record. There is no dead-letter queue. The `*/15` sweep re-sends `pending` jobs that are due and untouched for 10 minutes. A failed enqueue call from the app therefore only delays work by up to 15 minutes, and rows outlive the 24-hour Free message retention [queues-limits].

Why a Queue rather than polling: today the enqueue path already starts work immediately (`docs/architecture/regeneration-worker-runbook.md`, "Workflow-backed regeneration"), and the 15-minute drain is only a fallback. Re-hosting the drain on a cron would make every regeneration wait up to 15 minutes. The Queue keeps immediate start and adds what polling and plain Workflows lack:

- **Native delayed redelivery** for the existing `retryAfter` behavior.
- **A concurrency cap.** `max_concurrency` [queues-concurrency] keeps regeneration bursts from using the account-wide 100 concurrent Workflow instances [wf-limits] that user-facing plan generation and lessons need, and from exhausting Hyperdrive's roughly 20 origin connections on Free [hd-limits].

**Cost.** About 3 Queue operations per job [queues-pricing]; 10,000 per day on Free is about 3,300 jobs per day.

### Alternatives rejected

- **Port the 15-minute drain to a Cron Trigger.** Adds up to 15 minutes of latency to every regeneration and keeps polling.
- **App → Worker → regeneration Workflow, no Queue.** Simplest, and consistent with lessons and plan generation, but it has no isolation from the shared Workflow concurrency pool. Choose this instead if B4's staging measurements show regeneration volume too low for concurrency to matter.
- **Consumer starts a Workflow per job.** Restores per-step durability, but the cap then limits only Workflow creation, not running work, which defeats the reason for the Queue. Inline execution relies on the replay guards that already exist: the CAS claim, attempt reservation, and the `already_finalized` short-circuit (`docs/architecture/workflow-sdk.md`, Safe replay rules). The cost is that a failure after the provider call repeats that call on redelivery.

### Open risks

- A consumer invocation that dies after the provider call but before finalize repeats the AI call on redelivery. That uses an OpenRouter call but not a second quota slot (the attempt is already reserved).

## Decision 9: CPU-time risk and measurement plan

### Free-plan limits that matter

- 10 ms CPU per invocation, per Cron Trigger, and per Workflow step [workers-limits][wf-limits].
- 50 external and 1,000 internal subrequests per invocation [workers-limits][wf-limits].
- A one-second startup limit for global scope, measured separately [workers-limits].
- Waiting on network or database I/O does not count as CPU.
- Isolates tolerate infrequent overruns, but consistent overruns are terminated (`exceededCpu`) [workers-limits].

### Risk by job

| Job | Runs as | CPU-heavy work in one invocation or step | Free-plan risk |
| --- | --- | --- | --- |
| Plan cleanup | Cron | Two bulk `UPDATE`s, logging | Low |
| Retention cleanup | Cron | One SQL function call | Low |
| Regeneration sweep | Cron (same tick as cleanup) | One `SELECT`, a few `send()` calls | Low |
| Email delivery page | Workflow step | Per recipient: preference and content queries, HTML build, HMAC unsubscribe token, Resend call. `DEFAULT_BATCH_SIZE = 50` (`src/features/notifications/email/delivery-service.ts:49`) means 50 Resend calls per page, plus Sentry | Medium for CPU; certain to break the 50 external-subrequest limit, so the Worker page size drops to 20 on Free |
| Regeneration | Queue consumer | OpenRouter stream parsing, Zod validation of the plan, pacing, transactional insert of all modules and tasks | High |
| Module lessons | Workflow step | One provider batch for every task in a module, lesson-content parsing and Zod validation, per-task updates | High |
| Plan create/retry | Workflow step | Same as regeneration | High |

AI Workflow steps also need explicit step configuration. Workflows retry a failed step 5 times with exponential backoff by default (10-minute timeout) [wf-sleeping], which would repeat provider calls and fight the domain's attempt cap. B5 and B6 set `retries` deliberately and throw `NonRetryableError` for permanent failures [wf-api]. Steps also return IDs, not payloads, because step results are capped at 1 MiB [wf-limits].

### Measurement plan

1. **B2 baseline.** On staging (Free), record CPU time for the heartbeat cron and one Hyperdrive query from Workers Logs invocation logs, which carry CPU and wall time [workers-limits].
2. **B3a/B3b.** Record CPU per cleanup tick and per email page step on staging; tune the page size for both CPU and subrequests.
3. **B4, the first AI job.** Before any AI production cutover, run at least 20 staging regenerations with the real OpenRouter provider (not the mock) across small, typical, and largest plan sizes. Collect p50, p95, and max CPU per invocation from Workers Logs, plus any `exceededCpu` or `exceededResources` outcomes (Workers Logs, `wrangler tail` [wf-limits]). Use DevTools CPU profiling under `wrangler dev` to find hotspots [cpu-profiling].
4. **B5.** Repeat for lesson generation (at least 20 modules of varying task counts). This is the formal Free vs Paid gate in the parent plan, and it now also gates B4's production cutover.
5. **Gate.** Stay on Free only if no measured run hit `exceededCpu` and the maximum step CPU is at or below 7 ms (30% headroom, because tolerance for overruns is not guaranteed). Otherwise, with the user's approval at that step, upgrade to Workers Paid ($5 per month minimum [pricing]) and set `limits.cpu_ms` (Paid default 30 seconds, maximum 5 minutes) [workers-limits].

**Paid also lifts:**

- Subrequests: 10,000.
- Cron Triggers: 250.
- Daily requests: no limit.
- Queue retention: up to 14 days.
- Workflow state retention: 30 days.
- Workers Logs retention: 7 days.

In-code timing cannot replace these numbers: `Date.now()` and `performance.now()` do not advance during CPU-only work in Workers [sentry-cf][cpu-profiling].

### Open risks

- Mock-provider runs understate CPU because their output is small and fixed; only real-provider staging runs count for the gate.
- Global-scope startup grows with the bundle (Zod schemas, Drizzle schema, OpenRouter SDK). `wrangler deploy` reports `startup_time_ms` [workers-limits]; B2 records it.

## Free-plan budget (account-wide; staging and production share it)

| Quota | Free limit | Expected use | Source |
| --- | --- | --- | --- |
| Worker requests and Workflow executions | 100,000 per day | About 200 cron invocations per day plus commands, consumer runs, and Workflow steps | [workers-limits][wf-limits] |
| Worker Cron Triggers | 5 per account | 4 | [workers-limits] |
| Workflow schedules | 100 per account | 4 | [wf-limits] |
| CPU | 10 ms per invocation and per step | Decision 9 | [workers-limits] |
| Subrequests | 50 external, 1,000 internal | Email page ≤ 20 sends | [workers-limits] |
| Hyperdrive | 100,000 queries per day; about 20 origin connections per config; 60 s per statement; 10 configs | Hundreds per day for cleanup; email about 5 per recipient | [hd-pricing][hd-limits] |
| Queues | 10,000 operations per day; 24-hour retention | About 3 per regeneration | [queues-pricing][queues-limits] |
| Workflows | 100 concurrent instances; 3-day state; 1 MiB per step result; 1,024 steps | Lessons and plan generation use a handful of steps | [wf-limits] |
| Workers Logs | 200,000 events per day; 3-day retention | Both environments | [workers-logs] |
| Workers Builds | 3,000 minutes per month; 1 concurrent build | One build per push to `develop` or `main` | [builds-limits] |
| WAF rate-limiting rules | 1 per zone; path and verified-bot fields; 10 s period and mitigation | 1 (`jobs-worker-v1`) | [waf-rl] |

## Exact Cloudflare resources for B1

B1 creates only what is listed under "Created by the user". Everything under "Created by deploy" comes from `wrangler.jsonc` through Workers Builds. The step-by-step procedure is in [cloudflare-b1-checklist.md](./cloudflare-b1-checklist.md).

### Created by the user (B1)

| Resource | Name | Environment | Dashboard page | Settings | Copy back |
| --- | --- | --- | --- | --- | --- |
| DNS zone | `atlaris.app` (Free plan, full setup) | both | Domains → Onboard a domain; nameservers changed at Squarespace | Records copied from Vercel DNS; every Vercel-pointing record DNS only; no `workers` or `workers-staging` records | Zone status (Active); assigned nameservers; "all records present" |
| Hyperdrive configuration | `atlaris-jobs-db-staging` | staging | Hyperdrive → Create configuration | Supabase `atlaris-dev` direct connection (fallback: session pooler, port 5432), user `postgres`; caching disabled | Hyperdrive ID; which connection type worked |
| Hyperdrive configuration | `atlaris-jobs-db-production` | production | Hyperdrive → Create configuration | Supabase `atlaris-prod`, same rules | Hyperdrive ID; connection type |
| Queue | `atlaris-regeneration-staging` | staging | Queues → Create queue | Defaults (Free retention is fixed at 24 hours) | Name confirmation |
| Queue | `atlaris-regeneration-production` | production | Queues → Create queue | Defaults | Name confirmation |
| Worker, Git-connected | `atlaris-jobs-staging` | staging | Workers & Pages → Create application → Import a repository | Repo `saldanaj97/atlaris`; root directory `workers/jobs`; production branch `feature/jcs-120-move-atlaris-background-jobs-to-cloudflare-workers` until Track B first merges into `develop`, then `develop`; deploy command with `--env staging`; preview builds off; custom domain `workers-staging.atlaris.app` (attached by deploy, verified in Domains & Routes); `workers.dev` disabled | Custom domain attached yes/no; first build ID and result |
| Worker, Git-connected | `atlaris-jobs-production` | production | Same | Root `workers/jobs`; branch `main`; deploy command with `--env production`; preview builds off; custom domain `workers.atlaris.app`; `workers.dev` disabled | Custom domain attached yes/no; first build ID and result |
| Rate-limiting rule | `jobs-worker-v1` | both (zone-wide) | `atlaris.app` zone → Security rules → Create rule → Rate limiting rules | URI path starts with `/v1/`; per IP; more than 100 requests in 10 s → Block for 10 s [waf-rl-create] | Rule deployed yes/no; burst-test result |
| Worker secrets | `JOBS_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` | each Worker | Worker → Settings → Variables and Secrets → Add → Secret | Values from the table below | Names only |
| Build variables | `PNPM_VERSION=11.9.0`, `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=true`; build secret `SENTRY_AUTH_TOKEN` | each Worker | Worker → Settings → Build → Build variables and secrets | `package.json:5-8` requires pnpm 11 and Node 24; the build image defaults to pnpm 10.11.1 [build-image] | Names only |

### Secret contents

| Secret | Holds | Value source | First used |
| --- | --- | --- | --- |
| `JOBS_SIGNING_SECRET` | HMAC key for app → Worker commands | New random value (at least 32 bytes) per environment, stored in 1Password; the same value goes into Vercel's `JOBS_SIGNING_SECRET` for that environment | B4 (B2 may prove signing) |
| `OPENROUTER_API_KEY` | OpenRouter API key | Staging reuses the `develop` Preview's key (decided 2026-10-05); production uses the app's Production key | B4 |
| `RESEND_API_KEY` | Resend API key | Staging reuses the `develop` Preview's key (decided 2026-10-05); production uses the app's Production key | B3b |
| `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` | HMAC secret for one-click unsubscribe tokens (unpadded base64url, at least 32 bytes; `src/lib/config/env/email.ts:62-86`) | **Must equal** the app's value in that environment; the app verifies tokens the Worker signs | B3b |
| `SENTRY_AUTH_TOKEN` (build secret) | Sentry auth token for release and source-map upload to `atlaris-jobs` | New Sentry token that can write to the `atlaris-jobs` project, stored in 1Password | B2 |

### Sentry (user-performed)

| Item | Value | Copy back |
| --- | --- | --- |
| Project | `atlaris-jobs` in org `jcs-software`, platform Cloudflare Workers | Project slug |
| DSN | Becomes `SENTRY_DSN` in `wrangler.jsonc` for both environments (not a secret) | The DSN |
| Auth token | `SENTRY_AUTH_TOKEN` above; must have access to `atlaris-jobs` | "created" (no value) |

### App-side settings (Vercel, user-performed)

| Variable | Preview (`develop` only) | Production |
| --- | --- | --- |
| `JOBS_WORKER_URL` | `https://workers-staging.atlaris.app` | `https://workers.atlaris.app` |
| `JOBS_SIGNING_SECRET` | Staging Worker's value | Production Worker's value |

### Created by deploy (for reference; not B1)

| Resource | Names | Phase |
| --- | --- | --- |
| Cron Triggers | `*/15 * * * *`, `0 3 * * *` per environment | B2, B3a |
| Workflow | `atlaris-email-delivery-<env>` (binding `EMAIL_DELIVERY_WORKFLOW`, class `EmailDeliveryWorkflow`, schedules `0 14 * * *` and `30 14 * * MON`) | B3b |
| Queue consumer and producer | `atlaris-regeneration-<env>` (binding `REGENERATION_QUEUE`) | B4 |
| Workflow | `atlaris-module-lessons-<env>` (`MODULE_LESSONS_WORKFLOW`, `ModuleLessonsWorkflow`) | B5 |
| Workflow | `atlaris-plan-generation-<env>` (`PLAN_GENERATION_WORKFLOW`, `PlanGenerationWorkflow`) | B6 |
| Bindings | `HYPERDRIVE`, `CF_VERSION_METADATA` | B2 |
| Custom domains and their DNS records and certificates | `workers-staging.atlaris.app`, `workers.atlaris.app` (from `routes` with `custom_domain: true`) | B2 |
| Switch variables | `JOBS_PAUSED`, `JOB_*_ENABLED` (dashboard, at each cutover) | B3a–B6 |

## Open questions for the user

1. **Staging `APP_URL` (resolved 2026-10-06).** `https://staging.atlaris.app`, the `develop` deployment's custom domain. It goes into email links sent from staging. The domain is behind Vercel Deployment Protection; the Worker makes no HTTP calls to the app, so no bypass secret is needed.

### Decisions recorded after review (2026-10-05)

| Question | Decision | Decided by | Where |
| --- | --- | --- | --- |
| Staging deploy branch | Track B parent branch until Track B first merges into `develop`, then `develop` | User | Decision 2; checklist B2 |
| Sentry project | Separate project `atlaris-jobs`; release = commit SHA | User | Decision 5; checklist A7 |
| Staging credentials | Reuse the `develop` Preview's OpenRouter and Resend keys | User | Secret contents; checklist A6 |
| B4 vs B5 ordering | B4's production cutover follows B5's CPU gate | Orchestrator | Decisions 7 and 9 |
| Observation windows | Plan cleanup 7 days; retention 7 daily runs; email 14 days; regeneration, lessons, plan generation 7 days and at least 20 production jobs each | Orchestrator | Decision 7 |
| Hyperdrive role | `postgres`, matching the service-role client; a least-privilege role is a possible follow-up outside Track B | Orchestrator | Decision 2 |
| Public endpoint | Custom domains `workers-staging.atlaris.app` and `workers.atlaris.app`; the whole `atlaris.app` zone moves from Vercel DNS to Cloudflare Free (nameservers only; registrar stays Squarespace; Vercel records DNS-only); `workers.dev` disabled; one rate-limiting rule on `/v1/` | User | Decisions 2 and 4; checklist A0, B5, B6 |

## Sources

All pages read on 2026-10-05 as Markdown (`index.md`) from developers.cloudflare.com unless noted.

| Label | Page |
| --- | --- |
| [workers-limits] | https://developers.cloudflare.com/workers/platform/limits/ (updated Sep 5, 2026) |
| [pricing] | https://developers.cloudflare.com/workers/platform/pricing/ |
| [cron-triggers] | https://developers.cloudflare.com/workers/configuration/cron-triggers/ (updated Sep 4, 2026) |
| [scheduled] | https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ |
| [wf-limits] | https://developers.cloudflare.com/workflows/reference/limits/ (updated Sep 21, 2026) |
| [wf-trigger] | https://developers.cloudflare.com/workflows/build/trigger-workflows/ (updated Sep 17, 2026) |
| [wf-api] | https://developers.cloudflare.com/workflows/build/workers-api/ |
| [wf-rules] | https://developers.cloudflare.com/workflows/build/rules-of-workflows/ |
| [wf-sleeping] | https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/ |
| [wf-local] | https://developers.cloudflare.com/workflows/build/local-development/ (updated Sep 28, 2026) |
| [queues-limits] | https://developers.cloudflare.com/queues/platform/limits/ |
| [queues-pricing] | https://developers.cloudflare.com/queues/platform/pricing/ |
| [queues-batching] | https://developers.cloudflare.com/queues/configuration/batching-retries/ |
| [queues-concurrency] | https://developers.cloudflare.com/queues/configuration/consumer-concurrency/ |
| [queues-http] | https://developers.cloudflare.com/queues/examples/publish-to-a-queue-via-http/ |
| [hd-pooling] | https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/ (updated Aug 20, 2026) |
| [hd-caching] | https://developers.cloudflare.com/hyperdrive/concepts/query-caching/ |
| [hd-limits] | https://developers.cloudflare.com/hyperdrive/platform/limits/ |
| [hd-pricing] | https://developers.cloudflare.com/hyperdrive/platform/pricing/ |
| [hd-postgresjs] | https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/ (updated Oct 1, 2026) |
| [hd-drizzle] | https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ |
| [hd-supabase] | https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/ |
| [hd-local] | https://developers.cloudflare.com/hyperdrive/configuration/local-development/ |
| [hd-troubleshoot] | https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/ |
| [builds-config] | https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ (updated Sep 22, 2026) |
| [builds-monorepo] | https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/ |
| [builds-branch] | https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/ (updated Oct 1, 2026) |
| [builds-limits] | https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ |
| [builds-troubleshoot] | https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/ |
| [build-image] | https://developers.cloudflare.com/workers/ci-cd/builds/build-image/ |
| [watch-paths] | https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/ |
| [environments] | https://developers.cloudflare.com/workers/wrangler/environments/ (updated Sep 22, 2026) |
| [wrangler-config] | https://developers.cloudflare.com/workers/wrangler/configuration/ |
| [wrangler-cmds] | https://developers.cloudflare.com/workers/wrangler/commands/workers/ |
| [bundling] | https://developers.cloudflare.com/workers/wrangler/bundling/ |
| [process] | https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/ |
| [node-crypto] | https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/ |
| [als] | https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/ |
| [bindings] | https://developers.cloudflare.com/workers/runtime-apis/bindings/ |
| [env-vars] | https://developers.cloudflare.com/workers/configuration/environment-variables/ |
| [secrets] | https://developers.cloudflare.com/workers/configuration/secrets/ |
| [env-local] | https://developers.cloudflare.com/workers/local-development/environment-variables/ |
| [workers-logs] | https://developers.cloudflare.com/workers/observability/logs/workers-logs/ (updated Oct 2, 2026) |
| [tail-workers] | https://developers.cloudflare.com/workers/observability/logs/tail-workers/ |
| [cpu-profiling] | https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/ |
| [rollbacks] | https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/ |
| [gradual] | https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/ |
| [sentry-cf] | https://docs.sentry.io/platforms/javascript/guides/cloudflare/ |
| [sentry-wrangler] | https://docs.sentry.io/platforms/javascript/guides/cloudflare/install/wrangler/ |
| [sentry-workflows] | https://docs.sentry.io/platforms/javascript/guides/cloudflare/features/workflows/ |
| [sentry-crons] | https://docs.sentry.io/platforms/javascript/guides/cloudflare/crons/ |
| [supabase-connect] | https://supabase.com/docs/guides/database/connecting-to-postgres |
| [custom-domains] | https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ (updated Sep 29, 2026) |
| [dns-full-setup] | https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/ (updated Jul 29, 2026) |
| [waf-rl-create] | https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/ (updated Aug 3, 2026) |
| [vercel-domains] | https://vercel.com/docs/domains/working-with-domains/add-a-domain (wildcard domains with an external DNS provider) |
| [dns-subdomain] | https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/ (updated Aug 14, 2026) and https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/setup/ |
| [waf-rl] | https://developers.cloudflare.com/waf/rate-limiting-rules/ |

Related docs: [Workflow SDK](./workflow-sdk.md) · [Internal worker routes](./internal-worker-routes.md) · [Regeneration worker runbook](./regeneration-worker-runbook.md) · [Email delivery runbook](./email-notification-delivery-runbook.md) · [Plan cleanup runbook](./plan-cleanup-runbook.md) · [Retention cleanup runbook](./retention-cleanup-runbook.md) · [Plan generation architecture](./plan-generation-architecture.md)
