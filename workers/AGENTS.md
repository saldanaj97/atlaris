# Workers Guidelines

**Parent:** [Root AGENTS.md](../AGENTS.md)

This directory holds the Cloudflare jobs Worker, `workers/jobs/` (`@atlaris/jobs`). It runs cron jobs, the plan-regeneration queue consumer, and the email delivery, module lessons, and plan generation Workflows. Keep this file short. Design lives in [cloudflare-jobs-runtime.md](../docs/architecture/cloudflare-jobs-runtime.md), and the local loop and commands in [workers-local-dev.md](../docs/development/workers-local-dev.md).

## Layout and config

- `workers/jobs/cloudflare.config.ts` (`cf/config`) defines the Worker for each mode. With no `--mode` it is the local-only `atlaris-jobs`, which is never deployed. `--mode staging` is `atlaris-jobs-staging` and `--mode production` is `atlaris-jobs-production`. Each mode lists its own bindings, vars, and secrets.
- `workers/jobs/wrangler.config.ts` holds the bundler alias (`@sentry/nextjs` → `@sentry/cloudflare`), the tsconfig path, and dev-server settings.
- Use the `cf` CLI, not Wrangler config files, and run `cf` and Wrangler from `workers/jobs/`.
- Worker code imports domain logic from `@/` and `@supabase/`. Keep job logic in `src/features/**` and keep the Worker a thin entry layer (`workers/jobs/src/index.ts`, `workers/jobs/src/http/`, `workers/jobs/src/jobs/`, `workers/jobs/src/workflows/`).

## Commands

- `pnpm workers dev`: runs the local Worker against this worktree's native Supabase stack (run `pnpm db start` first). It refuses non-loopback database hosts.
- `pnpm workers check`: the bundle and startup gate. It fails if the bundle contains `next`, `@vercel/*`, `@clerk/*`, or the Vercel `workflow` runtime, or if startup CPU exceeds the budget.
- `pnpm workers types`: regenerates `workers/jobs/.cloudflare/types/index.d.ts` after any `cloudflare.config.ts` change. Commit the result, because CI fails on a diff.
- `pnpm check:type:workers`: typechecks the Worker and `tests/unit/workers` (part of `pnpm typecheck`).
- `pnpm test unit tests/unit/workers`: Worker unit tests (Vitest, Node, mocked bindings). Prove Workers-runtime behavior with `pnpm workers dev` and on staging, not with a second harness.

## Runtime rules

- Never reuse I/O across invocations. Open the database through `withInvocationDb` (handlers) or `withStepDb` (Workflow steps) in `workers/jobs/src/db.ts`; never create a module-level pool or client.
- Keep heavy work out of module scope. Cloudflare rejects a deploy whose startup takes too long on its validator (error 10021). Load large single-path dependencies inside the handler with `await import(...)`.
- Every job stops while the Flagship flag `jobs-paused` is on: check `isJobsPaused()` from `workers/jobs/src/switches.ts` (it fails open, so a Flagship outage does not pause jobs). Jobs have no switch of their own, except retention cleanup (`job-retention-cleanup`, because it deletes data), module lessons (`module-lesson-generation`), and email delivery and the PostHog deletion retry, which run only when `WORKER_ENV` is `production`. Handlers and jobs take these readers as injected deps; only `src/index.ts` and the Workflow entrypoints import `switches.ts`. Don't add a per-job switch for a new job; `jobs-paused` and the app's `maintenance-mode` cover it.
- Feature flags (`grounded-generation`, `module-lesson-generation`) and the job switches (`jobs-paused`, `job-retention-cleanup`, `parallel-direct-research`) are Cloudflare Flagship flags read through the `FLAGS` binding. Call `registerWorkerFlags(env)` (`workers/jobs/src/flags.ts`) right after `parseWorkerEnv` in every handler and Workflow `run`; without it the shared helpers in `src/` return their defaults. Read a flag inside a Workflow step, never between steps, so a replay sees the same value. Flags are created only in the Flagship dashboard, never from code. The Worker does not read `email-notification-delivery`: it gates only the app's manual email route, and stopping Worker email takes `jobs-paused`.
- App-to-Worker commands are HMAC-signed `POST /v1/<command>` requests verified in `workers/jobs/src/http/signature.ts`. During a contract change the Worker accepts both the old and the new command shape.
- Queue messages and Workflow steps can be retried. Claim work atomically and keep each step idempotent. For regeneration, `job_queue` is the record and the 15-minute sweep re-sends lost work.
- Cloudflare cron weekdays start at 1 = Sunday. Use names (`MON`), not numbers.

## Secrets and environments

- Secrets are Worker secrets declared with `bindings.secret()`; job switches are Flagship flags, not secrets. Never put values in Git or in plain-text vars. `pnpm secrets:sync cloudflare <mode>` writes the operator secrets.
- Locally, values come from `workers/jobs/.dev.vars` (gitignored; names are in `.dev.vars.example`).
- Never point the local Worker at deployed resources or pass a remote option to `cf dev`.
- Workers Builds deploys staging from `develop` and production from `main`. Flipping Flagship flags, deploying, and changing dashboard settings are release-owner steps. Give the exact steps or `cf` command; don't run them unless asked.

## Anti-patterns

- Importing `next`, `@clerk/*`, `@vercel/*`, or `react` on a job path.
- A module-level database pool, or pool I/O that outlives its invocation or step.
- Editing `.cloudflare/types/index.d.ts` by hand, or skipping `pnpm workers types` after a config change.
- A per-job switch for a new job; `jobs-paused` and `maintenance-mode` cover it (design note, Decision 7).
- Starting work from the app by any route other than a signed Worker command.
