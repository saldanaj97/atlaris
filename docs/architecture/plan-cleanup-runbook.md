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
| `PLAN_CLEANUP_ENABLED`     | Master switch for the plan cleanup HTTP endpoint (defaults to `false` when unset)            | Set `true` in Vercel Production |
| `MAINTENANCE_WORKER_TOKEN` | Bearer token for internal route auth                                                         | Set to the same secret in Vercel Production and GitHub Actions |

## Scheduled Cleanup

Plan cleanup has **no** `pg_cron` schedule. Production is scheduled by `.github/workflows/plan-cleanup-scheduler.yml`, which POSTs to `https://atlaris.app/api/internal/maintenance/plans/cleanup` every 15 minutes.

The workflow uses the `MAINTENANCE_WORKER_TOKEN` GitHub Actions secret as a Bearer token. The same value must be configured in Vercel Production. The workflow fails with a status-specific annotation for `401`, `500`, and `503`, and it rejects a `200` response unless the JSON body contains `"ok": true`.

Vercel Cron is intentionally not used: the project is on the Hobby plan, which only supports one cron invocation per day. The 15-minute recovery target therefore uses GitHub Actions.

Equivalent scheduler request:

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

## Production Scheduler Verification

| Check | Expected |
| ----- | -------- |
| Workflow | `.github/workflows/plan-cleanup-scheduler.yml` |
| Target URL | `https://atlaris.app/api/internal/maintenance/plans/cleanup` |
| HTTP method | `POST` |
| Cadence | Every **15 minutes** |
| Auth mechanism | `Authorization: Bearer <token>` |
| Token source | GitHub Actions and Vercel Production use the same `MAINTENANCE_WORKER_TOKEN` value |
| Scheduler history | At least one recent run shows **HTTP 200** |
| Response body | `{ "ok": true, "stuckPlansCleaned": <number>, "orphanedAttemptsCleaned": <number> }` |

Manual spot-check (replace host; use the same header the scheduler uses):

```bash
curl -sS -o /tmp/plan-cleanup.json -w "%{http_code}" \
  -X POST "https://<production-host>/api/internal/maintenance/plans/cleanup" \
  -H "Authorization: Bearer ${MAINTENANCE_WORKER_TOKEN}"
```

Success evidence: exit prints `200` and `/tmp/plan-cleanup.json` contains `"ok":true`.

## Alerting

Authenticated cleanup executions are wrapped in the Sentry Cron monitor `plan-cleanup-maintenance`. The monitor runs on the same 15-minute schedule, creates an issue after one failed or missed check-in, and resolves after one successful recovery check-in.

| Status | Meaning | Alert expectation | Log / signal hints |
| ------ | ------- | ----------------- | ------------------ |
| **401** | Worker token missing, wrong, or mismatched | GitHub workflow fails immediately; Sentry monitor becomes missed if authentication remains broken | `Unauthorized plan cleanup trigger attempt` with `hasToken: true/false` |
| **503** | Route disabled or production missing `MAINTENANCE_WORKER_TOKEN` | GitHub workflow fails immediately; Sentry monitor becomes missed while cleanup is unavailable | `Plan cleanup is currently unavailable.`; `Maintenance worker token missing in production` |
| **500** | Cleanup logic failed after auth | GitHub workflow fails immediately and Sentry records an error check-in | `stuck_plans_cleanup_partial_failure` |
| **200 with a full batch** | At least 1,000 stuck plans were eligible in one run | Investigate recurring full batches before recovery falls behind | `stuck_plans_cleanup_batch_full` |

Verification steps:

1. Confirm the GitHub Actions workflow history contains a recent successful scheduled run.
2. Confirm Sentry monitor `plan-cleanup-maintenance` has a recent successful check-in.
3. After rotating the token, update GitHub Actions and Vercel Production before the next scheduled run.
4. For 500 triage, search logs for `stuck_plans_cleanup_partial_failure` and correlate with plans stuck in `generating` past the 15-minute threshold.

## Operational Checks

- Verify the GitHub Actions scheduler is active and posting every 15 minutes.
- Monitor plans stuck in `generating` status for longer than the 15-minute threshold.
- Monitor orphaned `in_progress` generation attempts with null classification.
- Verify GitHub workflow failure notifications and the Sentry Cron monitor remain enabled.

## Incident Response

1. **Plans stuck in generating:** verify the external scheduler is running, manually trigger the internal endpoint, and inspect application logs for `stuck_plans_cleanup_partial_failure` errors.
2. **401 unauthorized:** rotate/redeploy `MAINTENANCE_WORKER_TOKEN`; confirm Bearer or `x-maintenance-worker-token` on scheduler/manual triggers.
3. **Emergency pause:** set `PLAN_CLEANUP_ENABLED=false` while investigating. Stuck plans will accumulate until cleanup is re-enabled.
4. **Partial cleanup failure (500):** inspect logs for `stuck_plans_cleanup_partial_failure`; this indicates a locked plan was not updated — investigate concurrent generation state changes or DB issues before re-triggering.
