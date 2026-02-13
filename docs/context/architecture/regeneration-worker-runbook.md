# Regeneration Worker Runbook

**Audience:** Developers and operators running queued plan regeneration.  
**Last Updated:** February 2026

## Overview

Regeneration requests are enqueued by `POST /api/v1/plans/:planId/regenerate` and executed by the internal drain endpoint:

- `POST /api/internal/jobs/regeneration/process`

This endpoint drains up to `REGENERATION_MAX_JOBS_PER_DRAIN` jobs by calling `drainRegenerationQueue()`.

## Required Environment

| Variable                          | Purpose                                       | Production expectation      |
| --------------------------------- | --------------------------------------------- | --------------------------- |
| `REGENERATION_QUEUE_ENABLED`      | Master switch for enqueue/drain behavior      | `true`                      |
| `REGENERATION_MAX_JOBS_PER_DRAIN` | Max jobs processed per drain call             | Set to a safe bounded value |
| `REGENERATION_WORKER_TOKEN`       | Shared bearer token for internal drain auth   | Required                    |
| `REGENERATION_INLINE_PROCESSING`  | Inline processing fallback from enqueue route | `false` in production       |

## Triggering the Worker

Use a scheduler (Cron, GitHub Actions, Vercel cron, etc.) to call:

```bash
curl -X POST "https://<app-host>/api/internal/jobs/regeneration/process" \
  -H "Authorization: Bearer ${REGENERATION_WORKER_TOKEN}"
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
  "ok": false,
  "error": "<code>"
}
```

## Operational Checks

- Monitor job backlog in `job_queue` for growing `pending` rows.
- Alert on repeated `failedCount > 0` drains.
- Alert on `401` responses from the internal drain endpoint (token mismatch/absence).
- Alert on `503` responses (`REGENERATION_QUEUE_ENABLED=false` or missing worker token in production).

## Incident Response

1. **Queue backed up:** verify scheduler is running and internal endpoint is reachable.
2. **401 unauthorized:** rotate/redeploy `REGENERATION_WORKER_TOKEN`; confirm scheduler header.
3. **Repeated failed jobs:** inspect worker logs and `job_queue.last_error`, then replay by re-enqueueing or manual retry.
4. **Emergency load shedding:** temporarily set `REGENERATION_MAX_JOBS_PER_DRAIN=0` (drains become no-op) while investigating.
