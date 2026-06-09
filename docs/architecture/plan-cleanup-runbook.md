# Plan Cleanup Runbook

**Audience:** Developers and operators running stuck-plan and orphaned-attempt maintenance.
**Last Updated:** June 2026

## Overview

Plans stuck in `generating` status and orphaned `in_progress` generation attempts are cleaned up by application code in `src/features/plans/cleanup.ts`. Unlike retention cleanup, this logic is **not** duplicated in a database function or `pg_cron` job — the canonical production path is an external scheduler that POSTs to the internal maintenance route.

Cleanup operations:

- **Stuck plans:** Plans in `generating` status with `updated_at` older than 15 minutes are marked `failed`.
- **Orphaned attempts:** `in_progress` generation attempts with no classification and `created_at` older than 15 minutes are finalized with `status=failure` and `classification=timeout`.

## Required Environment

| Variable                   | Purpose                                                                                      | Production expectation                 |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `PLAN_CLEANUP_ENABLED`     | Master switch for the plan cleanup HTTP endpoint (defaults to `false` when unset)            | Set `true` in environments where cleanup runs |
| `MAINTENANCE_WORKER_TOKEN` | Bearer token for internal route auth                                                         | Required when `PLAN_CLEANUP_ENABLED=true` in production |

## Scheduled Cleanup

Plan cleanup has **no** `pg_cron` schedule. Production must configure an external scheduler (Vercel Cron, GitHub Actions, or equivalent) to POST to the internal route.

Recommended cadence: **every 5–15 minutes**. Stuck thresholds are 15 minutes, so a 5–15 minute schedule ensures abandoned plans are recovered promptly without excessive load.

Example scheduler request:

```bash
curl -X POST "https://<app-host>/api/internal/maintenance/plans/cleanup" \
  -H "Authorization: Bearer ${MAINTENANCE_WORKER_TOKEN}"
```

Alternate auth (Bearer and custom header are mutually exclusive):

```bash
curl -X POST "https://<app-host>/api/internal/maintenance/plans/cleanup" \
  -H "x-maintenance-worker-token: ${MAINTENANCE_WORKER_TOKEN}"
```

In non-production environments, if the route is enabled and no worker token is configured, auth is not required.

## Manual Cleanup

Operators can trigger the same cleanup through the internal route when `PLAN_CLEANUP_ENABLED=true` (see curl examples above).

## Expected Response

Success shape:

```json
{
  "ok": true,
  "stuckPlansCleaned": 0,
  "orphanedAttemptsCleaned": 0
}
```

Failure shape follows the canonical API error contract (`docs/api/error-contract.md`). A partial bulk update during stuck-plan cleanup throws and returns `500`.

## Operational Checks

- Verify the external scheduler is active and posting on the expected cadence.
- Monitor plans stuck in `generating` status for longer than the 15-minute threshold.
- Monitor orphaned `in_progress` generation attempts with null classification.
- Alert on `401` responses from the internal cleanup endpoint (token mismatch/absence).
- Alert on `503` responses (`PLAN_CLEANUP_ENABLED=false` or missing worker token in production).

## Incident Response

1. **Plans stuck in generating:** verify the external scheduler is running, manually trigger the internal endpoint, and inspect application logs for `stuck_plans_cleanup_partial_failure` errors.
2. **401 unauthorized:** rotate/redeploy `MAINTENANCE_WORKER_TOKEN`; confirm Bearer or `x-maintenance-worker-token` on scheduler/manual triggers.
3. **Emergency pause:** set `PLAN_CLEANUP_ENABLED=false` while investigating. Stuck plans will accumulate until cleanup is re-enabled.
4. **Partial cleanup failure (500):** inspect logs for `stuck_plans_cleanup_partial_failure`; this indicates a locked plan was not updated — investigate concurrent generation state changes or DB issues before re-triggering.
