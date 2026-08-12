# Regeneration Worker Runbook

**Audience:** Developers and operators running queued plan regeneration.  
**Last Updated:** August 2026

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
