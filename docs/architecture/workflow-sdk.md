# Workflow SDK (durable execution)

**Audience:** Developers operating or extending workflow-backed generation.
**Last Updated:** October 2026

## Overview

Atlaris uses [Workflow SDK](https://workflow-sdk.dev) for durable, replay-safe orchestration of **plan regeneration only**. Plan create/retry, module lessons, and email delivery run as Cloudflare Workflows on the jobs Worker ([Cloudflare Workers job runtime](./cloudflare-jobs-runtime.md)); their Vercel Workflow SDK paths are retired. Postgres remains the source of truth for user-visible status; workflow run IDs are stored for correlation only.

Base wiring: `withWorkflow()` in `next.config.ts`, `workflow` TypeScript plugin in `tsconfig.json`, and `/.well-known/workflow/` handled by an early proxy auth branch (see [Callback security](#callback-security)).

Temporary Next.js 16.3.2 workaround: `next.config.ts` skips `withWorkflow()` only when the process entrypoint is Next's `telemetry/detached-flush.js`. That uploader reloads development config during shutdown; initializing Workflow there can leave an orphaned watcher and bundler service. Normal dev, build, and start commands retain Workflow. Remove the guard after upgrading to a release containing [Next.js #97718](https://github.com/vercel/next.js/pull/97718). Regression coverage lives in `tests/unit/config/next-config.spec.ts`.

## Callback security

Workflow queue callbacks hit `/.well-known/workflow/v1/*` from the Workflow SDK runtime, not from end users.

| Deployment | Protection |
| ---------- | ---------- |
| **Vercel (production/preview)** | Workflow SDK registers handlers with `experimentalTriggers` so only [Vercel Queue](https://vercel.com/docs/queues) can invoke them. Proxy allows these routes through without an app token. |
| **Local dev (`pnpm dev` / `pnpm dev --db`)** | Portless + Webpack + `withWorkflow()` runs the Workflow SDK plan regeneration path. Plan create/retry, module lessons, and the manual email route always dispatch to the jobs Worker, so locally they need the Worker running (`pnpm workers dev`, see [workers-local-dev.md](../development/workers-local-dev.md)) with matching `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET` in the app and the `JOB_PLAN_GENERATION_ENABLED` / `JOB_MODULE_LESSONS_ENABLED` / `JOB_EMAIL_DELIVERY_ENABLED` switches in the Worker's `.dev.vars`. `pnpm dev --db` ensures the local Supabase stack. Prefer Preview (`pnpm deploy:preview`) when you need Vercel Queue callback semantics. Use `pnpm dev --ui` only for UI-only work (Portless + Turbopack; no workflow runtime). |
| **Self-hosted / non-Vercel production** | Proxy requires `WORKFLOW_CALLBACK_TOKEN` via `Authorization: Bearer` or `x-workflow-callback-token`. Missing token configuration returns `503`. |

Webhook resume routes (`/.well-known/workflow/v1/webhook/:token`) keep the SDK's URL-token auth and bypass the callback token gate.

Implementation: `resolveWorkflowCallbackAccess()` in `src/lib/proxy/workflow-callback-auth.ts`, invoked from `src/proxy.ts` before Clerk, maintenance mode, and CSP decoration. The proxy matcher includes `/.well-known/workflow/*`; maintenance bypass for that prefix remains in `middleware-policy.ts`.

## Product workflows

Plan regeneration is the one product path still on Workflow SDK:

| Path | Behavior |
| ---- | -------- |
| Plan regeneration | Enqueue and worker drain call `attachPlanRegenerationWorkflow` (start + CAS persist `job_queue` runId); drain may return `workflow-in-flight`. `REGENERATION_RUNTIME=cloudflare` sends the enqueue to the jobs Worker instead. |

Where the other paths run:

| Path | Runtime |
| ---- | ------- |
| Plan create/retry | Cloudflare Workflow `PlanGenerationWorkflow`; the app sends a signed `POST /v1/plan-generation/start`. |
| Module lessons | Cloudflare Workflow `ModuleLessonsWorkflow`; the app sends a signed `POST /v1/module-lessons/start`. |
| Email delivery | Cloudflare Workflow `EmailDeliveryWorkflow`, started by the Worker's cron triggers or by the manual maintenance route. |

Pipeline context: [plan create/retry and module lessons](./plan-generation-architecture.md) · [queued regeneration](./regeneration-worker-runbook.md) · [email delivery](./email-notification-delivery-runbook.md).

## Workflow file layout

| Area              | Files                                              |
| ----------------- | -------------------------------------------------- |
| Plan regeneration | `src/features/plans/workflows/plan-regeneration.*` |

The `*.types.ts` modules for plan generation, module lessons, and email delivery remain because the Worker and the app share their input and result types. They contain no `"use workflow"` or `"use step"` functions.

DB, AI, and queue side effects live in `"use step"` functions. Request routes authenticate and start workflows; steps use the service-role client.

## Correlation metadata

| Surface                  | Where run ID is stored                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Plan regeneration        | `job_queue.payload.workflow.runId` (CAS via `updateJobPayloadIfRunIdMissing` / attach layer) |
| Plan create/retry        | `generation_attempts.metadata.workflow` (`provider: 'cloudflare-workflow'`; `workflow-sdk` on regeneration attempts and older rows) |
| Module lesson generation | `modules.lessonGenerationMetadata.workflow.runId` (Cloudflare instance ID; written by `claimModuleLessonGenerationOrDescribe`) |

To trace a regeneration run: read the row above, then inspect Workflow SDK / Vercel workflow UI for the `runId`. For Cloudflare instances, use the instance ID in the Cloudflare Workflows dashboard or Workers Logs.

## Safe replay rules

- **Do not** call `reserveAttemptSlot` twice on replay; workflow paths pass an existing reservation.
- Plan regeneration workflow claims the job once in `claimPlanRegenerationJobStep`; generation uses normal lifecycle finalization.
- `already_finalized` from `PlanLifecycleService` / the generation port short-circuits provider work when the **attempt** is already `success` or `failure`. Replay is attempt-status based, not plan `ready` + `finalizedAt`.

## Preview testing

Workflow behavior is tested in Vercel Preview rather than through a local workflow runtime. Deploy the current worktree, then run:

```bash
pnpm deploy:preview
```

The command deploys the current worktree to the linked Vercel project and prints the Preview URL. Preview uses Vercel Queue callbacks rather than the local same-process self-fetch loop. After triggering a workflow, verify its terminal state in Vercel runtime logs and workflow observability.

## Testing

Workflow SDK tests use a **separate** Vitest config and their own isolated Testcontainers database. The changed integration runner includes a workflow phase, while full workflow coverage is an explicit phase in `pnpm test all`:

| Command                                       | Purpose                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm test integration`                       | DB/API integration tests only                                                                          |
| `pnpm test integration --changed`             | Changed DB/API integration tests, then changed Workflow SDK tests (passes when no workflow tests hit) |
| `pnpm test workflow`                          | Workflow SDK wiring and production entrypoints against isolated Postgres                              |
| `pnpm exec vitest run --config vitest.config.ts --project unit tests/unit/...` | Unit tests for workflow helpers, wrappers, and orchestration (no runtime plugin) |

- Config: `vitest.workflow.config.ts`
- Bundle output: `.workflow-vitest/`
- Default discovery: production workflow directories plus `tests/helpers/workflow`
- Override discovery roots: `WORKFLOW_VITEST_DIRS=dir-a,dir-b` (comma-separated)

Orchestration for the regeneration workflow is covered in `tests/unit/features/**/workflows/*.workflow.spec.ts` by calling workflow functions directly with mocked steps (per [Workflow SDK testing](https://workflow-sdk.dev/docs/testing)). The Worker's Cloudflare Workflows are covered in `tests/unit/workers/jobs/`.

## Related docs

- [Plan generation architecture](./plan-generation-architecture.md) — create/retry and status polling ([durable workflows](./plan-generation-architecture.md#durable-workflows)) and [module lesson generation](./plan-generation-architecture.md#module-lesson-generation-separate-pipeline)
- [Regeneration worker runbook](./regeneration-worker-runbook.md) — queued plan regeneration worker and durable drain
- [Environment variables](../development/environment.md#workflow-sdk) — Workflow SDK callback configuration
- [Development commands](../development/commands.md) — `pnpm deploy:preview` and workflow test commands
- [Test guidance](../../tests/AGENTS.md#workflow-sdk-tests) — Workflow SDK Vitest harness and changed-test workflow phase
- [README testing](../../README.md#testing) — default changed bundle includes the workflow test phase
