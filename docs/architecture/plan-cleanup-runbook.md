# Plan Cleanup Runbook

**Audience:** Developers and operators running stuck-plan and orphaned-attempt maintenance.
**Last Updated:** October 2026

## Overview

Plans stuck in `generating` status and orphaned `in_progress` generation attempts are cleaned up by application code in `src/features/plans/cleanup.ts`. Unlike retention cleanup, this logic is **not** duplicated in a database function or `pg_cron` job — the production schedule is the jobs Worker's cron trigger (see below). The internal maintenance route stays for manual operations.

Cleanup operations:

- **Stuck plans:** Plans in `generating` status with `updated_at` older than 15 minutes are marked `failed`.
- **Orphaned attempts:** `in_progress` generation attempts with no classification and `created_at` older than 15 minutes are finalized with `status=failure` and `classification=timeout`.

## Required Environment

| Variable                   | Purpose                                                                           | Production expectation                                                            |
| -------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `PLAN_CLEANUP_ENABLED`     | Master switch for the plan cleanup HTTP endpoint (defaults to `false` when unset) | Set `true` in Vercel Production                                                   |
| `MAINTENANCE_WORKER_TOKEN` | Bearer token for internal route auth                                              | Set in Vercel Production for manual runs                                          |

## Scheduled cleanup (Cloudflare Worker)

The `atlaris-jobs` Worker owns the schedule: Cron `*/15 * * * *` runs `runPlanCleanupMaintenance` directly through Hyperdrive (`workers/jobs/src/jobs/plan-cleanup.ts`), with the same bounds as the route. Design: `docs/architecture/cloudflare-jobs-runtime.md`, Decision 7.

| Item | Value |
| --- | --- |
| Switch | `JOB_PLAN_CLEANUP_ENABLED=true` (Worker variable, off when absent); `JOBS_PAUSED=true` pauses it |
| Old owner | The GitHub Actions scheduler (`plan-cleanup-scheduler.yml`) was removed in B7a (JCS-134) |
| Failures | Reported to Sentry (`atlaris-jobs`) with tags `job=plan-cleanup`, `runtime=cloudflare-worker`; the invocation is marked failed. No cron monitor |
| Manual fallback | The HTTP route below stays available for manual operations |

## Manual route

Plan cleanup has **no** `pg_cron` schedule. `POST /api/internal/maintenance/plans/cleanup` is for manual operations; the Worker cron above runs the same cleanup every 15 minutes. Send the maintenance token as a Bearer token or the custom header.

Equivalent request:

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

## Production Verification

Scheduled runs are visible as Worker invocations (`job=plan-cleanup`) in Workers Logs; failures reach Sentry (`atlaris-jobs`). To check the route by hand:

Manual spot-check (replace host):

```bash
curl -sS -o /tmp/plan-cleanup.json -w "%{http_code}" \
  -X POST "https://<production-host>/api/internal/maintenance/plans/cleanup" \
  -H "Authorization: Bearer ${MAINTENANCE_WORKER_TOKEN}"
```

Success evidence: exit prints `200` and `/tmp/plan-cleanup.json` contains `"ok":true`.

## Alerting

Authenticated manual route executions are wrapped in the Sentry Cron monitor `plan-cleanup-maintenance`. The Worker cron reports failures to Sentry (`atlaris-jobs`) instead and has no cron monitor.

| Status                    | Meaning                                                         | Alert expectation                                                                                 | Log / signal hints                                                                         |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **401**                   | Worker token missing, wrong, or mismatched                      | The manual request fails immediately                                                              | `Unauthorized plan cleanup trigger attempt` with `hasToken: true/false`                    |
| **503**                   | Route disabled or production missing `MAINTENANCE_WORKER_TOKEN` | The manual request fails immediately                                                              | `Plan cleanup is currently unavailable.`; `Maintenance worker token missing in production` |
| **500**                   | Cleanup logic failed after auth                                 | The manual request fails and Sentry records an error check-in                                     | `stuck_plans_cleanup_partial_failure`                                                      |
| **200 with a full batch** | At least 1,000 stuck plans were eligible in one run             | Investigate recurring full batches before recovery falls behind                                   | `stuck_plans_cleanup_batch_full`                                                           |

Verification steps:

1. Confirm Workers Logs show recent `job=plan-cleanup` invocations that succeeded.
2. After rotating the token, update Vercel Production so manual runs keep working.
3. For 500 triage, search logs for `stuck_plans_cleanup_partial_failure` and correlate with plans stuck in `generating` past the 15-minute threshold.

## Operational Checks

- Verify the Worker cron trigger is active and `JOB_PLAN_CLEANUP_ENABLED=true`.
- Monitor plans stuck in `generating` status for longer than the 15-minute threshold.
- Monitor orphaned `in_progress` generation attempts with null classification.
- Verify Sentry alerts for the `atlaris-jobs` project remain enabled.

## Incident Response

1. **Plans stuck in generating:** verify the Worker cron is running, manually trigger the internal endpoint, and inspect application logs for `stuck_plans_cleanup_partial_failure` errors.
2. **401 unauthorized:** rotate/redeploy `MAINTENANCE_WORKER_TOKEN`; confirm Bearer or `x-maintenance-worker-token` on manual triggers.
3. **Emergency pause:** set `PLAN_CLEANUP_ENABLED=false` while investigating. Stuck plans will accumulate until cleanup is re-enabled.
4. **Partial cleanup failure (500):** inspect logs for `stuck_plans_cleanup_partial_failure`; this indicates a locked plan was not updated — investigate concurrent generation state changes or DB issues before re-triggering.
