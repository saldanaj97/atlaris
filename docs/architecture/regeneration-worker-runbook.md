# Regeneration Worker Runbook

**Audience:** Developers and operators running queued plan regeneration.  
**Last Updated:** October 2026

## Overview

Regeneration requests are enqueued by `POST /api/v1/plans/:planId/regenerate` and executed by the Cloudflare jobs Worker (`atlaris-jobs-production`, `atlaris-jobs-staging`) through a Cloudflare Queue ([design note](./cloudflare-jobs-runtime.md), Decisions 4, 7, 8). The Vercel Workflow SDK path and the GitHub Actions drain were removed in B7b (JCS-134); there is no other regeneration runtime and no internal drain route.

## Required Environment

| Variable                     | Purpose                                               | Production expectation                                                                         |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `REGENERATION_QUEUE_ENABLED` | App master switch for accepting regeneration requests | Explicitly `true` in Production; otherwise defaults `false`. When off, the route answers `503` |
| `JOBS_WORKER_URL`            | Worker origin for the signed enqueue command          | Required (see [Settings](#settings))                                                           |
| `JOBS_SIGNING_SECRET`        | Shared HMAC key with the Worker                       | Required (see [Settings](#settings))                                                           |

The queue defaults on in development, test, and Vercel Preview. It remains off in Production until `REGENERATION_QUEUE_ENABLED=true` is set.

## Cloudflare jobs Worker

### Flow

1. `POST /api/v1/plans/:planId/regenerate` runs admission (rate limit, tier, duration, content access, non-settling quota peek) and inserts the `job_queue` row.
2. The route always sends a signed `POST {JOBS_WORKER_URL}/v1/regeneration/enqueue { v: 1, jobId }` (`dispatchRegenerationToWorker`, `src/features/jobs/regeneration-dispatch.ts`). It always answers `202 pending`. Any non-2xx response, timeout (10 s, no retry), or missing configuration is logged and leaves the row `pending` for the sweep.
3. The Worker verifies the HMAC signature (`workers/jobs/src/http/signature.ts`), then puts `{ v: 1, jobId }` on `atlaris-regeneration-<env>`.
4. The queue consumer (`workers/jobs/src/jobs/regeneration-consumer.ts`; `max_batch_size: 1`, `max_batch_timeout: 0`, `max_retries: 3`, `max_concurrency: 2`) runs the job inline with `runPlanRegeneration` (`src/features/jobs/regeneration-run.ts`): claim (CAS) → reserve attempt → process → finalize.
5. Every `*/15` tick, the sweep (`workers/jobs/src/jobs/regeneration-sweep.ts`) re-sends `pending` regeneration rows that are due (`scheduled_for <= now()`) and untouched for 10 minutes (`updated_at`), at most 50 per tick, and bumps their `updated_at` so the next tick does not re-send them. `job_queue` stays the durable record; there is no dead-letter queue.

`REGENERATION_QUEUE_ENABLED` gates the route on the app.

### Correlation

`job_queue.payload.workflow` and the attempt's `generation_attempts.metadata.workflow` carry `provider: "cloudflare-queue"` and the queue message ID as `runId` (rows written before B7b carry `provider: "workflow-sdk"`). Worker logs for a run include `jobId`, `runId`, `deliveryAttempt`, `outcome`, and `wallMs`; Workers Logs invocation records carry the CPU time to compare against (Decision 9).

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

Regeneration finalization starts lesson generation for the first two modules. On the Worker, the injected starter (`createWorkflowModuleLessonStarter`) runs the app's flag check (`JOB_MODULE_LESSONS_ENABLED`), preflight, and provisional claim, then creates the module lessons Workflow instance directly. With the lessons switch off it starts nothing and the modules stay `not_generated`.

### Signed commands

Headers `x-atlaris-jobs-timestamp: <unix seconds>` and `x-atlaris-jobs-signature: v1=<hex>`, where `<hex>` is HMAC-SHA256 with `JOBS_SIGNING_SECRET` over `<timestamp>.<METHOD>.<path>.<hex sha256(body)>` (`src/lib/jobs-worker/contract.ts`). The Worker rejects timestamps more than 300 s off and answers `401` with no body; during rotation it also accepts `JOBS_SIGNING_SECRET_PREVIOUS`. Responses: `202 { accepted, jobId }`, `400` invalid body, `401` bad signature, `503 { code: "jobs_paused" | "job_disabled" }`, `500` queue send failure.

### Settings

| Where                          | Name                           | Purpose                                                                              |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------ |
| App (Vercel)                   | `REGENERATION_QUEUE_ENABLED`   | Master switch for accepting regeneration requests (`503` when off)                   |
| App (Vercel)                   | `JOBS_WORKER_URL`              | Worker origin (`https://workers-staging.atlaris.app`, `https://workers.atlaris.app`) |
| App (Vercel) and Worker secret | `JOBS_SIGNING_SECRET`          | Shared HMAC key per environment                                                      |
| Worker secret (optional)       | `JOBS_SIGNING_SECRET_PREVIOUS` | Old key during rotation                                                              |
| Worker variable (dashboard)    | `JOB_REGENERATION_ENABLED`     | Consumer, sweep, and enqueue command on/off (absent = off)                           |
| Worker variable (dashboard)    | `JOBS_PAUSED`                  | Pauses every job                                                                     |
| Worker secret                  | `OPENROUTER_API_KEY`           | Provider calls from the consumer                                                     |

### Enabling and rollback

Enable per environment: set the Worker secrets and the app's `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET`, set `JOB_REGENERATION_ENABLED=true` on the Worker, and set `REGENERATION_QUEUE_ENABLED=true` on the app. Watch the first regenerations: `job_queue.payload.workflow.provider = 'cloudflare-queue'`, consumer logs, and Workers Logs CPU per invocation.

Rollback: there is no alternate runtime to switch back to. To stop regeneration, set `REGENERATION_QUEUE_ENABLED=false` on the app (the route answers `503` and inserts no rows) and/or set `JOB_REGENERATION_ENABLED` off or `JOBS_PAUSED=true` on the Worker (the enqueue command answers `503`, the consumer stops working, and the sweep stops re-sending). Rows left `pending` are picked up by the sweep after the Worker switch is restored; CAS claims prevent double processing.

## Operational Checks

- Monitor job backlog in `job_queue` for growing `pending` rows; the Worker sweep should drain them within roughly one `*/15` tick plus the 10-minute settle window.
- Watch Workers Logs and Sentry (`atlaris-jobs`) for consumer outcomes (`jobId`, `runId`, `deliveryAttempt`, `outcome`, `wallMs`) and repeated `retry` outcomes.
- Alert on `503` from the enqueue command (`jobs_paused` or `job_disabled`) while the app switch is on.

## Incident Response

1. **Queue backed up:** confirm `JOB_REGENERATION_ENABLED=true` and `JOBS_PAUSED` is not set on the Worker, that the `*/15` cron is running, and that `JOBS_WORKER_URL` and `JOBS_SIGNING_SECRET` match between the app and the Worker.
2. **401 from the Worker:** the signing secrets differ; rotate with `JOBS_SIGNING_SECRET_PREVIOUS` on the Worker (see [Signed commands](#signed-commands)).
3. **Repeated failed jobs:** inspect Workers Logs and `job_queue.last_error`, then replay by re-enqueueing or manual retry.
4. **Emergency load shedding:** set `REGENERATION_QUEUE_ENABLED=false` on the app to stop new requests, or `JOBS_PAUSED=true` on the Worker to pause the consumer and sweep, while investigating.

## Related docs

- [Cloudflare Workers job runtime](./cloudflare-jobs-runtime.md) — design note, Decisions 4, 7, 8, 9
- [Plan generation architecture](./plan-generation-architecture.md) — create/retry and module lesson pipelines (separate from queued regeneration)
- [Environment variables](../development/environment.md) — regeneration queue and jobs Worker env vars
- [Workers local dev](../development/workers-local-dev.md) — `pnpm workers dev` loop
