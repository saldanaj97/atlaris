# Workflow SDK (durable execution)

**Audience:** Developers operating or extending workflow-backed generation.
**Last Updated:** May 2026

## Overview

Atlaris uses [Workflow SDK](https://workflow-sdk.dev) for durable, replay-safe orchestration behind feature flags. Postgres remains the source of truth for user-visible status; workflow run IDs are stored for correlation only.

Base wiring: `withWorkflow()` in `next.config.ts`, `workflow` TypeScript plugin in `tsconfig.json`, and `/.well-known/workflow/` handled by an early proxy auth branch (see [Callback security](#callback-security)).

## Callback security

Workflow queue callbacks hit `/.well-known/workflow/v1/*` from the Workflow SDK runtime, not from end users.

| Deployment | Protection |
| ---------- | ---------- |
| **Vercel (production/preview)** | Workflow SDK registers handlers with `experimentalTriggers` so only [Vercel Queue](https://vercel.com/docs/queues) can invoke them. Proxy allows these routes through without an app token. |
| **Local dev (`pnpm dev:workflow`)** | Proxy allows health checks (`HEAD`/`GET`/`OPTIONS` with `?__health`) and local-world queue callbacks that include `x-vqs-*` headers. Bare forged POSTs without those headers are rejected with `401`. |
| **Self-hosted / non-Vercel production** | Proxy requires `WORKFLOW_CALLBACK_TOKEN` via `Authorization: Bearer` or `x-workflow-callback-token`. Missing token configuration returns `503`. |

Webhook resume routes (`/.well-known/workflow/v1/webhook/:token`) keep the SDK's URL-token auth and bypass the callback token gate.

Implementation: `resolveWorkflowCallbackAccess()` in `src/lib/proxy/workflow-callback-auth.ts`, invoked from `src/proxy.ts` before Clerk, maintenance mode, and CSP decoration. The proxy matcher includes `/.well-known/workflow/*`; maintenance bypass for that prefix remains in `middleware-policy.ts`.

## Feature flags (`workflowEnv`)

Flag names, accepted values (`true`/`false`/`1`/`0`), and default-off behavior: [environment variables](../development/environment.md#workflow-sdk) (`workflowEnv` in [`src/lib/config/env/workflow.ts`](../../src/lib/config/env/workflow.ts)).

| Env variable                         | Behavior when `true`                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODULE_LESSON_WORKFLOW_ENABLED`     | `POST .../lesson-content/generate` starts `moduleLessonGenerationWorkflow` and returns `202` while work continues.                                                        |
| `PLAN_REGENERATION_WORKFLOW_ENABLED` | Enqueue path and worker drain start `planRegenerationWorkflow`; drain may return `workflow-in-flight` while a run is active.                                              |
| `PLAN_GENERATION_WORKFLOW_ENABLED`   | Create/retry SSE sessions reserve the attempt in-process, then run provider/finalization in `planGenerationWorkflow` (`await run.returnValue` — SSE transport unchanged). |

Pipeline context: [plan create/retry and module lessons](./plan-generation-architecture.md) · [queued regeneration](./regeneration-worker-runbook.md).

## Workflow file layout

| Area              | Files                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Module lessons    | `src/features/lesson-content/workflows/module-lesson-generation.*` |
| Plan regeneration | `src/features/plans/workflows/plan-regeneration.*`                 |
| Plan create/retry | `src/features/plans/workflows/plan-generation.*`                   |

DB, AI, and queue side effects live in `"use step"` functions. Request routes authenticate and start workflows; steps use the service-role client.

## Correlation metadata

| Surface                  | Where run ID is stored                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| Module lesson generation | `modules` lesson-generation metadata (`persistModuleLessonWorkflowRunMetadata`) |
| Plan regeneration        | `job_queue.data.workflow` on the regeneration job payload                       |
| Plan create/retry        | `generation_attempts.metadata.workflow`                                         |

To trace a run: read the row above, then inspect Workflow SDK / Vercel workflow UI for the `runId`.

## Safe replay rules

- **Do not** call `reserveAttemptSlot` or `claimModuleLessonGenerationOrDescribe` twice on replay; workflow paths extract post-claim work or pass an existing reservation.
- Plan regeneration workflow claims the job once in `claimPlanRegenerationJobStep`; generation uses normal lifecycle finalization.
- `already_finalized` from `GenerationAdapter` short-circuits provider work when a plan is already `ready` with `finalizedAt` set.

## Disabling workflows

Set the relevant env flag to `false` (or unset). The app falls back to the pre-workflow code paths (inline generation, queue drain without workflow, or synchronous SSE generation).

## Local development

The local world dispatches work by `POST`ing to `/.well-known/workflow/v1/flow` and `/step` on the same Next.js process. In practice, **`pnpm dev` (Turbopack) is unreliable** for this self-fetch loop: runs stay `pending`, the flow health route may hang, and logs may show `[local world] Queue operation failed` / `other side closed`.

**Recommended local setup:**

1. In `.env.local` (see `.env.local.example`):

   ```bash
   PORT=3000
   WORKFLOW_LOCAL_BASE_URL=http://127.0.0.1:3000
   ```

   `WORKFLOW_LOCAL_BASE_URL` must match the port the dev server actually listens on.

2. Run **`pnpm dev:workflow`** (webpack dev) instead of `pnpm dev` when testing workflow flags.

3. Ensure only **one** dev server is bound to that port.

4. Verify before triggering generation:

   ```bash
   curl -I "http://127.0.0.1:3000/.well-known/workflow/v1/flow?__health"   # expect 200
   npx workflow inspect runs
   ```

   After a successful run you should see `POST /.well-known/workflow/v1/flow` and `/step` in the dev console, and `npx workflow inspect run <runId>` should move from `pending` to `completed`.

Workflow data for dev lives under `.next/workflow-data/` (not `.workflow-data/`, which is used by Vitest).

## Testing

Workflow SDK tests use a **separate** Vitest config and their own isolated Testcontainers database. The changed integration runner includes a workflow phase, while full workflow coverage is an explicit phase in `pnpm test:all`:

| Command                                       | Purpose                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm test:integration`                       | DB/API integration tests only                                                                          |
| `pnpm test:integration:changed`               | Changed DB/API integration tests, then changed Workflow SDK tests (passes when no workflow tests hit) |
| `pnpm test:workflow`                          | Workflow SDK wiring and production entrypoints against isolated Postgres                              |
| `pnpm exec vitest run --config vitest.config.ts --project unit tests/unit/...` | Unit tests for workflow helpers, wrappers, and orchestration (no runtime plugin) |

- Config: `vitest.workflow.config.ts`
- Bundle output: `.workflow-vitest/`
- Default discovery: production workflow directories plus `tests/helpers/workflow`
- Override discovery roots: `WORKFLOW_VITEST_DIRS=dir-a,dir-b` (comma-separated)

Orchestration for product workflows is covered in `tests/unit/features/**/workflows/*.workflow.spec.ts` by calling workflow functions directly with mocked steps (per [Workflow SDK testing](https://workflow-sdk.dev/docs/testing)).

## Related docs

- [Plan generation architecture](./plan-generation-architecture.md) — SSE create/retry ([durable workflows](./plan-generation-architecture.md#durable-workflows-optional)) and [module lesson generation](./plan-generation-architecture.md#module-lesson-generation-separate-pipeline)
- [Regeneration worker runbook](./regeneration-worker-runbook.md) — queued plan regeneration worker and workflow-backed drain
- [Environment variables](../development/environment.md#workflow-sdk) — feature flags, `WORKFLOW_LOCAL_BASE_URL`, and `workflowEnv`
- [Development commands](../development/commands.md) — `pnpm dev:workflow` and workflow test commands
- [Test guidance](../../tests/AGENTS.md#workflow-sdk-tests) — Workflow SDK Vitest harness and changed-test workflow phase
- [README testing](../../README.md#testing) — default changed bundle includes the workflow test phase
