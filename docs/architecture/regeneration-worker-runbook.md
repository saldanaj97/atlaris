# Regeneration Worker Runbook

**Audience:** Developers and operators running queued plan regeneration.  
**Last Updated:** October 2026

## Overview

Regeneration requests are enqueued by `POST /api/v1/plans/:planId/regenerate` and executed by the internal drain endpoint:

- `POST /api/internal/jobs/regeneration/process`

This endpoint drains up to `REGENERATION_MAX_JOBS_PER_DRAIN` jobs by calling `drainRegenerationQueue()`. Auth is enforced by the shared internal worker helper (`assertInternalWorkerAccess`).

## Required Environment

| Variable                             | Purpose                                                                | Production expectation      |
| ------------------------------------ | ---------------------------------------------------------------------- | --------------------------- |
| `REGENERATION_QUEUE_ENABLED`         | Master switch for enqueue/drain behavior                               | Explicitly `true` after the worker trigger is configured; otherwise defaults `false` |
| `REGENERATION_MAX_JOBS_PER_DRAIN`    | Max jobs processed per drain call                                      | Set to a safe bounded value |
| `REGENERATION_WORKER_TOKEN`          | Shared bearer token for internal drain auth                            | Required                    |

The queue defaults on in development, test, and Vercel Preview. It remains off in Production until the GitHub scheduler is configured and verified.

## Workflow-backed regeneration

Enqueue (`requestPlanRegeneration`) and drain (`processPlanRegenerationJob`) both go through **`attachPlanRegenerationWorkflow`** (`src/features/plans/regeneration-orchestration/attach-workflow.ts`), which:

1. Starts `planRegenerationWorkflow` (via `startPlanRegenerationWorkflow`).
2. CAS-persists `job_queue.payload.workflow.runId` with `updateJobPayloadIfRunIdMissing` / `updateRegenerationJobPayloadIfRunIdMissing` (first writer wins; a rival runId is never overwritten).
3. On CAS loss, cancels the orphan workflow run when possible.
4. Emits `recordRegenerationWorkflowAttachUncertain` when persist fails and cancel is ambiguous.

### Attach outcomes

| Result | Meaning |
| ------ | ------- |
| `already-attached` | Payload already has a `runId` (rival won or prior attach). |
| `attached` | This run started and persisted its `runId`. |
| `start-failed` | Workflow runtime failed to create a run. |
| `persist-failed` | Run started but CAS persist lost / failed (includes cancel success flag). |

### Drain vs enqueue failure semantics

| Attach result | Drain (`process.ts`) | Enqueue (`request.ts`) |
| ------------- | -------------------- | ---------------------- |
| `already-attached` / `attached` | Return `workflow-in-flight` | Continue as success / in-flight |
| `start-failed` | `failJob(..., { retryable: true })` → `retryable-failure` (job stays pending when retries remain) | Same retryable terminalize; API `workflow-start-failed` with `retryable: true` |
| `persist-failed` | `failJob(..., { retryable: false })` → `permanent-failure` | Terminalize non-retryable; if cancel succeeds, quota **reverts** (`workflow-attach-canceled`); if cancel/terminalize fails, quota stays consumed |

Also:

- The drain endpoint may return `workflow-in-flight` while `job_queue.payload.workflow.runId` is set (Job type exposes this as `data.workflow`).
- Rejected workflow runs are terminalized via `failJob(..., { retryable: false })` when `run.returnValue` rejects, even if finalization never runs.
- Terminal queue outcomes are still written by workflow finalization steps (`completed`, `retryable-failure`, `permanent-failure`, `already-finalized`).
- The workflow claim step (`claimPlanRegenerationJobStep`) can adopt a processing job that still lacks a `runId` via the same CAS writer.

Correlate failures using `job_queue.payload.workflow.runId` and logs tagged with `workflowRunId`. See [Workflow SDK](./workflow-sdk.md) (correlation metadata and Preview testing). Preview workflow testing: [development commands](../development/commands.md) (`pnpm deploy:preview`).

## Cloudflare jobs Worker (opt-in, B4)

Track B moves regeneration to the `atlaris-jobs` Cloudflare Worker ([design note](./cloudflare-jobs-runtime.md), Decisions 4, 7, 8). The Vercel workflow path above stays the default until cutover.

### Flow

1. `POST /api/v1/plans/:planId/regenerate` runs the same admission (rate limit, tier, duration, content access, non-settling quota peek) and inserts the `job_queue` row.
2. With `REGENERATION_RUNTIME=cloudflare`, the route sends a signed `POST {JOBS_WORKER_URL}/v1/regeneration/enqueue { v: 1, jobId }` (`dispatchRegenerationToWorker`, `src/features/jobs/regeneration-dispatch.ts`) instead of attaching a Vercel workflow. It always answers `202 pending`. Any non-2xx response, timeout (10 s, no retry), or missing configuration is logged and leaves the row `pending` for the sweep.
3. The Worker verifies the HMAC signature (`workers/jobs/src/http/signature.ts`), then puts `{ v: 1, jobId }` on `atlaris-regeneration-<env>`.
4. The queue consumer (`workers/jobs/src/jobs/regeneration-consumer.ts`; `max_batch_size: 1`, `max_batch_timeout: 0`, `max_retries: 3`, `max_concurrency: 2`) runs the job inline with `runPlanRegeneration` (`src/features/jobs/regeneration-run.ts`): claim (CAS) → reserve attempt → process → finalize, the same steps as `planRegenerationWorkflow`.
5. Every `*/15` tick, the sweep (`workers/jobs/src/jobs/regeneration-sweep.ts`) re-sends `pending` regeneration rows that are due (`scheduled_for <= now()`) and untouched for 10 minutes (`updated_at`), at most 50 per tick, and bumps their `updated_at` so the next tick does not re-send them. `job_queue` stays the durable record; there is no dead-letter queue.

`REGENERATION_QUEUE_ENABLED` still gates the route on the app. `runPlanRegeneration` duplicates `plan-regeneration.steps.ts` without the Workflow SDK; keep the two in sync until B7 removes the Vercel path.

### Correlation

`job_queue.payload.workflow` and the attempt's `generation_attempts.metadata.workflow` carry `provider: "cloudflare-queue"` and the queue message ID as `runId` (Vercel runs carry `provider: "workflow-sdk"`). Worker logs for a run include `jobId`, `runId`, `deliveryAttempt`, `outcome`, and `wallMs`; Workers Logs invocation records carry the CPU time to compare against (Decision 9).

### Claim and retry semantics

| Situation                                                                             | Consumer result                                               | Message                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pending job                                                                           | CAS claim with this message's `runId`, then run               | ack when terminal                                                                                             |
| Job owned by another `runId` (duplicate send, sweep re-send)                          | `in-flight`, no work                                          | ack                                                                                                           |
| Redelivery of the same message                                                        | Resumes its own claim; reservation replays by idempotency key | —                                                                                                             |
| Completed, failed, missing, or invalid job                                            | No work                                                       | ack                                                                                                           |
| Retryable failure with retries left (reservation blocked, provider retryable failure) | `failJob(retryable)` reschedules the row                      | `retry({ delaySeconds })` until `scheduled_for`, capped at 24 h                                               |
| Unexpected error (database or provider outage)                                        | Reported to Sentry                                            | `retry({ delaySeconds: 60 })`; on the last delivery the run fails the job only if it still owns it, then acks |
| `JOBS_PAUSED=true` or `JOB_REGENERATION_ENABLED` not `true`                           | No work                                                       | `retryAll({ delaySeconds: 900 })`; exhausted messages drop and the sweep re-sends after resume                |

Quota follows the existing boundary (`reserveRegenerationQuotaAtProviderStart`): failures before the provider starts do not consume a regeneration; once the provider has started, the regeneration stays consumed. A consumer that dies after the provider call repeats that call on redelivery but not the quota slot.

The consumer relies on Cloudflare keeping a message's ID across redeliveries; staging confirms it (a changed ID would leave the job `processing` for plan cleanup instead of resuming).

### Module lessons

Regeneration finalization starts lesson generation for the first two modules. On the Worker, the injected starter (`createWorkflowModuleLessonStarter`) runs the app's flag check (`JOB_MODULE_LESSONS_ENABLED`), preflight, and provisional claim, then creates the module lessons Workflow instance directly. With the lessons switch off it starts nothing and the modules stay `not_generated`. Production cutover still waits for B5's CPU gate (design note, Decision 7).

### Signed commands

Headers `x-atlaris-jobs-timestamp: <unix seconds>` and `x-atlaris-jobs-signature: v1=<hex>`, where `<hex>` is HMAC-SHA256 with `JOBS_SIGNING_SECRET` over `<timestamp>.<METHOD>.<path>.<hex sha256(body)>` (`src/lib/jobs-worker/contract.ts`). The Worker rejects timestamps more than 300 s off and answers `401` with no body; during rotation it also accepts `JOBS_SIGNING_SECRET_PREVIOUS`. Responses: `202 { accepted, jobId }`, `400` invalid body, `401` bad signature, `503 { code: "jobs_paused" | "job_disabled" }`, `500` queue send failure.

### Settings

| Where                          | Name                           | Purpose                                                                              |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------ |
| App (Vercel)                   | `REGENERATION_RUNTIME`         | `vercel` (default) or `cloudflare`; any other value fails the request                |
| App (Vercel)                   | `JOBS_WORKER_URL`              | Worker origin (`https://workers-staging.atlaris.app`, `https://workers.atlaris.app`) |
| App (Vercel) and Worker secret | `JOBS_SIGNING_SECRET`          | Shared HMAC key per environment                                                      |
| Worker secret (optional)       | `JOBS_SIGNING_SECRET_PREVIOUS` | Old key during rotation                                                              |
| Worker variable (dashboard)    | `JOB_REGENERATION_ENABLED`     | Consumer, sweep, and enqueue command on/off (absent = off)                           |
| Worker variable (dashboard)    | `JOBS_PAUSED`                  | Pauses every job                                                                     |
| Worker secret                  | `OPENROUTER_API_KEY`           | Provider calls from the consumer                                                     |

### Cutover (staging first; production waits for B5)

1. Merge with `JOB_REGENERATION_ENABLED` absent and `REGENERATION_RUNTIME` unset: nothing changes.
2. Set the Worker secrets and the app's `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET` for the environment.
3. Set `JOB_REGENERATION_ENABLED=true` on the Worker.
4. Disable the old drain: GitHub repository variable `REGENERATION_QUEUE_ENABLED=false`.
5. Set `REGENERATION_RUNTIME=cloudflare` on the app and redeploy.
6. Watch the first regenerations: `job_queue.payload.workflow.provider = 'cloudflare-queue'`, consumer logs, and Workers Logs CPU per invocation. Run at least 20 real-provider regenerations across plan sizes for the Decision 9 CPU gate.

Rollback: unset `REGENERATION_RUNTIME` (or Vercel Instant Rollback), set `JOB_REGENERATION_ENABLED` off, and re-enable the GitHub drain. Rows the Worker left `pending` are picked up by the drain; CAS claims prevent double processing.

## Triggering the Worker

The GitHub Actions [regeneration worker scheduler](../../.github/workflows/regeneration-worker-scheduler.yml) runs every 15 minutes and supports manual dispatch. Scheduled runs execute only when the repository variable `REGENERATION_QUEUE_ENABLED` is `true`; manual dispatch bypasses that gate.

Configure the same `REGENERATION_WORKER_TOKEN` value in the production deployment and the GitHub Actions `Production – atlaris` environment secret. The scheduler calls:

```bash
curl -X POST "https://<app-host>/api/internal/jobs/regeneration/process" \
  -H "Authorization: Bearer ${REGENERATION_WORKER_TOKEN}"
```

Alternate auth (Bearer and custom header are mutually exclusive):

```bash
curl -X POST "https://<app-host>/api/internal/jobs/regeneration/process" \
  -H "x-regeneration-worker-token: ${REGENERATION_WORKER_TOKEN}"
```

In non-production environments, if no worker token is configured, auth is not required.

## Expected Response

Success shape:

```json
{
  "ok": true,
  "processedCount": 1,
  "completedCount": 1,
  "failedCount": 0
}
```

Failure shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

The endpoint now uses the canonical API error contract (see `docs/api/error-contract.md`) for all non-2xx responses.

## Operational Checks

- Monitor job backlog in `job_queue` for growing `pending` rows.
- Alert on repeated `failedCount > 0` drains. The GitHub Action
  `regeneration-worker-scheduler.yml` fails the run when `failedCount > 0`
  after a successful `ok: true` drain response.
- Alert on `401` responses from the internal drain endpoint (token mismatch/absence).
- Alert on `503` responses (`REGENERATION_QUEUE_ENABLED=false` or missing worker token in production).

## Incident Response

1. **Queue backed up:** verify scheduler is running and internal endpoint is reachable.
2. **401 unauthorized:** rotate/redeploy `REGENERATION_WORKER_TOKEN`; confirm Bearer or `x-regeneration-worker-token` on scheduler calls.
3. **Repeated failed jobs:** inspect worker logs and `job_queue.last_error`, then replay by re-enqueueing or manual retry.
4. **Emergency load shedding:** temporarily set `REGENERATION_MAX_JOBS_PER_DRAIN=0` (drains become no-op) while investigating.

## Related docs

- [Workflow SDK](./workflow-sdk.md) — run correlation and Preview testing
- [Plan generation architecture](./plan-generation-architecture.md) — create/retry and module lesson pipelines (separate from queued regeneration)
- [Environment variables](../development/environment.md#workflow-sdk) — workflow and regeneration queue env vars
- [Development commands](../development/commands.md) — `pnpm deploy:preview` and workflow test commands
