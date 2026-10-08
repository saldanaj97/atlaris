# Retention Cleanup Runbook

**Audience:** Developers and operators running database retention maintenance.
**Last Updated:** July 2026

## Overview

Expired OAuth state tokens, old Clerk webhook idempotency rows, and old terminal job-queue rows are pruned by the database-owned retention function:

- `private.cleanup_retained_db_rows()`

Supabase Cron schedules the function daily through migration `20260522223908_schedule_retention_cleanup.sql`. Raw `ai_usage_events` rows are intentionally excluded until a monthly aggregation model exists. Email delivery runs and ledger tombstones are also excluded: their retry, manual-review, and idempotency retention policy has not yet been approved.

## Required Environment

| Variable                    | Purpose                                                                                      | Production expectation                 |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `RETENTION_CLEANUP_ENABLED` | Master switch for the **manual HTTP cleanup endpoint** only (defaults to `false` when unset) | Set `true` only when enabling manual route access |
| `MAINTENANCE_WORKER_TOKEN`  | Bearer token for manual internal route auth (not used by cron)                               | Required only when the manual route is enabled    |

## Retention Windows

| Table                   | Policy                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `oauth_state_tokens`    | Delete rows with `expires_at < now()`                        |
| `clerk_webhook_event_claims` | Delete claims whose lease expired more than one day ago      |
| `clerk_webhook_events`  | Delete rows older than 45 days                               |
| `job_queue`             | Delete terminal `completed`/`failed` rows older than 30 days |
| `ai_usage_events`       | Not deleted by this endpoint                                 |
| `email_notification_delivery_runs` / `email_notification_deliveries` | Not deleted by this endpoint; see the email delivery runbook for payload minimization and non-sensitive inventory |

## Cloudflare Worker Owner (JCS-129, after cutover)

After cutover the `atlaris-jobs` Worker owns the schedule: Cron `0 3 * * *` calls `private.cleanup_retained_db_rows` through Hyperdrive (`workers/jobs/src/jobs/retention-cleanup.ts`). Design: `docs/architecture/cloudflare-jobs-runtime.md`, Decision 7.

| Item | Value |
| --- | --- |
| Switch | `JOB_RETENTION_CLEANUP_ENABLED=true` (Worker variable, off when absent); `JOBS_PAUSED=true` pauses it |
| Cutover | Unschedule the pg_cron job (`SELECT cron.unschedule('retention-cleanup');`), then enable the Worker switch before the next 03:00 UTC. Never run both owners. Production needs explicit approval |
| Observation window | 7 daily runs before B7 removes the old owner |
| Failures | Reported to Sentry (`atlaris-jobs`) with tags `job=retention-cleanup`, `runtime=cloudflare-worker`; the invocation is marked failed. No cron monitor |
| Manual fallback | The HTTP route below stays available until B7 |

## Scheduled Cleanup (current owner until cutover)

The canonical production schedule is installed by the database migration:

- Schedule name: `retention-cleanup`
- Schedule: `0 3 * * *` (03:00 UTC daily)
- Command: `SELECT * FROM "private"."cleanup_retained_db_rows"();`

The migration uses `cron.schedule`/`cron.unschedule` and skips schedule registration when `pg_cron` is unavailable, which keeps plain local test Postgres compatible.

## Manual Cleanup

Operators can still trigger the same retention policy through the internal route when `RETENTION_CLEANUP_ENABLED=true`:

```bash
curl -X POST "https://<app-host>/api/internal/maintenance/retention/cleanup" \
  -H "Authorization: Bearer ${MAINTENANCE_WORKER_TOKEN}"
```

Alternate auth (Bearer and custom header are mutually exclusive):

```bash
curl -X POST "https://<app-host>/api/internal/maintenance/retention/cleanup" \
  -H "x-maintenance-worker-token: ${MAINTENANCE_WORKER_TOKEN}"
```

In non-production environments, if the manual route is enabled and no worker token is configured, auth is not required.

## Expected Response

Success shape:

```json
{
  "ok": true,
  "expiredOauthStateTokens": 0,
  "expiredClerkWebhookEventClaims": 0,
  "oldClerkWebhookEvents": 0,
  "oldJobQueueRows": 0
}
```

Failure shape follows the canonical API error contract (`docs/api/error-contract.md`).

## Operational Checks

- In Supabase, inspect the `cron.job` and `cron.job_run_details` records for the `retention-cleanup` job.
- Monitor table growth for `oauth_state_tokens`, `clerk_webhook_event_claims`, `clerk_webhook_events`, and terminal `job_queue` rows if the scheduler stops running.
- Alert on `401` responses from the internal cleanup endpoint (token mismatch/absence).
- Alert on `503` responses from the manual cleanup endpoint (`RETENTION_CLEANUP_ENABLED=false` or missing worker token in production).

## Incident Response

1. **Tables growing faster than expected:** verify the Supabase Cron job exists, inspect `cron.job_run_details`, and manually trigger the internal endpoint if needed.
2. **401 unauthorized:** rotate/redeploy `MAINTENANCE_WORKER_TOKEN`; confirm Bearer or `x-maintenance-worker-token` on **manual** triggers (cron does not use HTTP auth).
3. **Emergency pause (scheduled cleanup):** unschedule the cron job in Supabase (`SELECT cron.unschedule('retention-cleanup');`) or disable it in the Supabase dashboard. Setting `RETENTION_CLEANUP_ENABLED=false` only pauses the manual HTTP route.
4. **Emergency pause (manual route only):** set `RETENTION_CLEANUP_ENABLED=false` while investigating.
