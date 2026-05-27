# Regeneration Worker Runbook

**Audience:** Developers and operators running queued plan regeneration.  
**Last Updated:** May 2026

## Overview

Regeneration requests are enqueued by `POST /api/v1/plans/:planId/regenerate` and executed by the internal drain endpoint:

- `POST /api/internal/jobs/regeneration/process`

This endpoint drains up to `REGENERATION_MAX_JOBS_PER_DRAIN` jobs by calling `drainRegenerationQueue()`. Auth is enforced by the shared internal worker helper (`assertInternalWorkerAccess`).

## Required Environment

| Variable                          | Purpose                                       | Production expectation      |
| --------------------------------- | --------------------------------------------- | --------------------------- |
| `REGENERATION_QUEUE_ENABLED`      | Master switch for enqueue/drain behavior      | `true`                      |
| `REGENERATION_MAX_JOBS_PER_DRAIN` | Max jobs processed per drain call             | Set to a safe bounded value |
| `REGENERATION_WORKER_TOKEN`       | Shared bearer token for internal drain auth   | Required                    |
| `REGENERATION_INLINE_PROCESSING`  | Inline processing fallback from enqueue route | `false` in production       |
| `PLAN_REGENERATION_WORKFLOW_ENABLED` | Routes drain/enqueue through Workflow SDK (`planRegenerationWorkflow`) | `false` (default) |

## Workflow-backed regeneration

When `PLAN_REGENERATION_WORKFLOW_ENABLED=true`:

- Successful enqueue calls `startPlanRegenerationWorkflow()` (fire-and-forget).
- The drain endpoint may start a workflow per job and return `workflow-in-flight` while `job_queue.data.workflow.runId` is set.
- Terminal queue outcomes are still written by workflow finalization steps (`completed`, `retryable-failure`, `permanent-failure`, `already-finalized`).

Correlate failures using `job_queue.data.workflow.runId` and logs tagged with `workflowRunId`. See `docs/architecture/workflow-sdk.md`.

## Triggering the Worker

Use a scheduler (Cron, GitHub Actions, Vercel cron, etc.) to call:

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
- Alert on repeated `failedCount > 0` drains.
- Alert on `401` responses from the internal drain endpoint (token mismatch/absence).
- Alert on `503` responses (`REGENERATION_QUEUE_ENABLED=false` or missing worker token in production).

## Incident Response

1. **Queue backed up:** verify scheduler is running and internal endpoint is reachable.
2. **401 unauthorized:** rotate/redeploy `REGENERATION_WORKER_TOKEN`; confirm Bearer or `x-regeneration-worker-token` on scheduler calls.
3. **Repeated failed jobs:** inspect worker logs and `job_queue.last_error`, then replay by re-enqueueing or manual retry.
4. **Emergency load shedding:** temporarily set `REGENERATION_MAX_JOBS_PER_DRAIN=0` (drains become no-op) while investigating.
