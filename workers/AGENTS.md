# Workers Guidelines

**Parent:** [Root AGENTS.md](../AGENTS.md)

This directory holds the Cloudflare jobs Worker, `workers/jobs/` (`@atlaris/jobs`). It runs cron jobs, the plan-regeneration queue consumer, and the email delivery, module lessons, and plan generation Workflows. Keep this file short. Design lives in [cloudflare-jobs-runtime.md](../docs/architecture/cloudflare-jobs-runtime.md), and the local loop and commands in [workers-local-dev.md](../docs/development/workers-local-dev.md).

## Layout and config

- `workers/jobs/cloudflare.config.ts` (`cf/config`) defines the Worker for each mode. With no `--mode` it is the local-only `atlaris-jobs`, which is never deployed. `--mode staging` is `atlaris-jobs-staging` and `--mode production` is `atlaris-jobs-production`. Each mode lists its own bindings, vars, and secrets.
- `workers/jobs/wrangler.config.ts` holds bundler aliases, the tsconfig path, and dev-server settings. The aliases replace Next- and Vercel-only modules (`@sentry/nextjs`, `flags/next`, `@flags-sdk/vercel`).
- Use the `cf` CLI, not Wrangler config files, and run `cf` and Wrangler from `workers/jobs/`.
- Worker code imports domain logic from `@/` and `@supabase/`. Keep job logic in `src/features/**` and keep the Worker a thin entry layer (`src/index.ts`, `src/http/`, `src/jobs/`, `src/workflows/`).

## Commands

- `pnpm workers dev`: runs the local Worker against this worktree's native Supabase stack (run `pnpm db start` first). It refuses non-loopback database hosts.
- `pnpm workers check`: the bundle and startup gate. It fails if the bundle contains `next`, `@vercel/*`, `@clerk/*`, or the Vercel `workflow` runtime, or if startup CPU exceeds the budget.
- `pnpm workers types`: regenerates `workers/jobs/.cloudflare/types/index.d.ts` after any `cloudflare.config.ts` change. Commit the result, because CI fails on a diff.
- `pnpm check:type:workers`: typechecks the Worker and `tests/unit/workers` (part of `pnpm typecheck`).
- `pnpm test unit tests/unit/workers`: Worker unit tests (Vitest, Node, mocked bindings). Prove Workers-runtime behavior with `pnpm workers dev` and on staging, not with a second harness.

## Runtime rules

- Never reuse I/O across invocations. Open the database through `withInvocationDb` (handlers) or `withStepDb` (Workflow steps) in `src/db.ts`; never create a module-level pool or client.
- Keep heavy work out of module scope. Cloudflare rejects a deploy whose startup takes too long on its validator (error 10021). Load large single-path dependencies inside the handler with `await import(...)`.
- Every job checks `isJobEnabled(env, '<JOB>')` from `src/switches.ts`. Switches default to off, and `JOBS_PAUSED=true` stops every job. When you add a job, add it to `JOB_NAMES` in `src/switches.ts` and to `JOB_SWITCHES` in `cloudflare.config.ts`.
- App-to-Worker commands are HMAC-signed `POST /v1/<command>` requests verified in `src/http/signature.ts`. During a contract change the Worker accepts both the old and the new command shape.
- Queue messages and Workflow steps can be retried. Claim work atomically and keep each step idempotent. For regeneration, `job_queue` is the record and the 15-minute sweep re-sends lost work.
- Cloudflare cron weekdays start at 1 = Sunday. Use names (`MON`), not numbers.

## Secrets and environments

- Secrets and job switches are Worker secrets declared with `bindings.secret()`. Never put values in Git or in plain-text vars. `pnpm secrets:sync cloudflare <mode>` writes the operator secrets.
- Locally, values come from `workers/jobs/.dev.vars` (gitignored; names are in `.dev.vars.example`).
- Never point the local Worker at deployed resources or pass a remote option to `cf dev`.
- Workers Builds deploys staging from `develop` and production from `main`. Flipping switches, deploying, and changing dashboard settings are release-owner steps. Give the exact `cf` command; don't run it unless asked.

## Anti-patterns

- Importing `next`, `@clerk/*`, `@vercel/*`, or `react` on a job path.
- A module-level database pool, or pool I/O that outlives its invocation or step.
- Editing `.cloudflare/types/index.d.ts` by hand, or skipping `pnpm workers types` after a config change.
- A new job without a default-off switch.
- Starting work from the app by any route other than a signed Worker command.
