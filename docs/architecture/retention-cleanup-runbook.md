# Retention Cleanup Runbook

**Audience:** Developers and operators running database retention maintenance.
**Last Updated:** May 2026

## Overview

Expired OAuth state tokens, old Stripe webhook idempotency rows, and old terminal job-queue rows are pruned by the database-owned retention function:

- `private.cleanup_retained_db_rows()`

Supabase Cron schedules the function daily through migration `20260522223908_schedule_retention_cleanup.sql`. Raw `ai_usage_events` rows are intentionally excluded until a monthly aggregation model exists.

## Required Environment

| Variable                    | Purpose                                                                                      | Production expectation                 |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `RETENTION_CLEANUP_ENABLED` | Master switch for the **manual HTTP cleanup endpoint** only (defaults to `false` when unset) | Set `true` when using the manual route |
| `MAINTENANCE_WORKER_TOKEN`  | Bearer token for manual internal route auth (not used by cron)                               | Required                               |

## Retention Windows

| Table                   | Policy                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `oauth_state_tokens`    | Delete rows with `expires_at < now()`                        |
| `stripe_webhook_events` | Delete rows older than 45 days                               |
| `job_queue`             | Delete terminal `completed`/`failed` rows older than 30 days |
| `ai_usage_events`       | Not deleted by this endpoint                                 |

## Scheduled Cleanup

The canonical production schedule is installed by the database migration:

- Schedule name: `retention-cleanup`
- Schedule: `0 3 * * *` (03:00 UTC daily)
- Command: `SELECT * FROM "private"."cleanup_retained_db_rows"();`

The migration uses `cron.schedule`/`cron.unschedule` and skips schedule registration when `pg_cron` is unavailable, which keeps plain local test Postgres compatible.

## Manual Cleanup

Operators can still trigger the same retention policy through the internal route:

```bash
curl -X POST "https://<app-host>/api/internal/maintenance/retention/cleanup" \
  -H "Authorization: Bearer ${MAINTENANCE_WORKER_TOKEN}"
```

Alternate auth (Bearer and custom header are mutually exclusive):

```bash
curl -X POST "https://<app-host>/api/internal/maintenance/retention/cleanup" \
  -H "x-maintenance-worker-token: ${MAINTENANCE_WORKER_TOKEN}"
```

In non-production environments, if no worker token is configured, auth is not required.

## Expected Response

Success shape:

```json
{
  "ok": true,
  "expiredOauthStateTokens": 0,
  "oldStripeWebhookEvents": 0,
  "oldJobQueueRows": 0
}
```

Failure shape follows the canonical API error contract (`docs/api/error-contract.md`).

## Operational Checks

- In Supabase, inspect the `cron.job` and `cron.job_run_details` records for the `retention-cleanup` job.
- Monitor table growth for `oauth_state_tokens`, `stripe_webhook_events`, and terminal `job_queue` rows if the scheduler stops running.
- Alert on `401` responses from the internal cleanup endpoint (token mismatch/absence).
- Alert on `503` responses from the manual cleanup endpoint (`RETENTION_CLEANUP_ENABLED=false` or missing worker token in production).

## Incident Response

1. **Tables growing faster than expected:** verify the Supabase Cron job exists, inspect `cron.job_run_details`, and manually trigger the internal endpoint if needed.
2. **401 unauthorized:** rotate/redeploy `MAINTENANCE_WORKER_TOKEN`; confirm Bearer or `x-maintenance-worker-token` on **manual** triggers (cron does not use HTTP auth).
3. **Emergency pause (scheduled cleanup):** unschedule the cron job in Supabase (`SELECT cron.unschedule('retention-cleanup');`) or disable it in the Supabase dashboard. Setting `RETENTION_CLEANUP_ENABLED=false` only pauses the manual HTTP route.
4. **Emergency pause (manual route only):** set `RETENTION_CLEANUP_ENABLED=false` while investigating.
