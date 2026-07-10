# Email Notification Delivery Runbook

Use this runbook for the optional email notification scheduler only. It does not apply to push, SMS, in-app, campaigns, or user-local-time scheduling.

## Schedule and ownership

Vercel Cron owns email invocation through one path:

| Logical run | UTC schedule | Monitor slug |
| --- | --- | --- |
| `daily` (`daily_reminder`, `streak_reminder`) | `0 14 * * *` | `email-notification-delivery-daily` |
| `weekly` (`weekly_summary`) | `30 14 * * 1` | `email-notification-delivery-weekly` |

Vercel Cron can be delayed, missed, or invoked more than once. Hobby precision is hourly, so both Sentry monitors use a 60-minute check-in margin. The application uses the durable `(run_kind, scheduler_date_utc)` key and the per-message delivery ledger to make duplicates safe.

Only one email scheduler may be active. The GitHub workflow `.github/workflows/email-notification-delivery-scheduler.yml` must stay absent while the Vercel Cron entries are enabled.

## Inspect a run

1. In Vercel, inspect the Cron invocation for `GET /api/cron/notifications/email` and record the response's `runId` and `workflowRunId`.
2. Inspect the Workflow SDK run by `workflowRunId` to find the current durable step or retry.
3. Inspect the matching Sentry monitor. A check-in begins when the workflow claims the run and closes only on `completed`, `failed`, or `needs_review`.
4. Inspect the service-role delivery run and ledger without selecting recipient addresses or provider payloads:

```sql
SELECT id, run_kind, scheduler_date_utc, status, workflow_run_id,
       cursor_user_id, pages_completed, sent, skipped, failed,
       manual_review, recipient_errors, last_error_class, updated_at
FROM email_notification_delivery_runs
WHERE id = '<run-id>';
```

The run record is an operational checkpoint. `email_notification_deliveries` remains the source of truth for individual sends and idempotency.

## Trigger a safe manual run

Use the manual recovery route with `MAINTENANCE_WORKER_TOKEN`, never `CRON_SECRET`. It accepts only a code-owned run kind, UTC date, and explicit action.

```bash
curl --fail-with-body \
  --request POST 'https://atlaris.app/api/internal/maintenance/notifications/email' \
  --header "Authorization: Bearer $MAINTENANCE_WORKER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"runKind":"daily","schedulerDateUtc":"2026-07-10","action":"start"}'
```

For a weekly run, use a Monday UTC date and `"runKind":"weekly"`. A `start` request creates a missing logical run only; an identical request returns the existing run and never starts a second workflow.

## Recover paused or failed work

1. Correct the feature-flag, Resend, configuration, or infrastructure cause.
2. Send the same `runKind` and `schedulerDateUtc` with `"action":"resume"`.
3. Confirm the response has a new Workflow run ID and that the persisted cursor and reference timestamp remain unchanged.

`resume` is only valid for `paused` or `failed` runs. It does not recompute a run's date-dependent eligibility or content.

## Handle `needs_review`

`needs_review` means the run observed an isolated recipient error or an ambiguous provider/idempotency outcome. It is intentionally terminal and does not automatically resend.

1. Inspect the affected ledger rows and resolve the underlying data or provider state.
2. Confirm no unresolved `manual_review` ledger rows remain for the logical run.
3. Trigger the same run with `"action":"replay_reviewed"`.

This action resets the run cursor but retains the logical date and domain delivery keys. Already-terminal ledger rows prevent duplicate sends. Do not use it merely to retry an unknown provider outcome.

## Stop delivery or roll back

- Turn off the `email-notification-delivery` Vercel Flag to stop the cron route before it reserves work and to pause a workflow before its next page.
- If the cron invocation itself is unhealthy, disable the Vercel email Cron entries.
- Do not re-enable the deleted GitHub scheduler as a parallel fallback. Resolve the durable run and resume it through the manual route after correction.

## Deployment checks

Before enabling delivery, apply the run-table migration, deploy the application and `vercel.json`, configure a distinct `CRON_SECRET`, confirm exactly two Vercel email Cron entries, and make a disabled-path check. Then exercise one opted-in safe account and verify the run, workflow, monitor, and ledger correlation.

`20260710151930_create_email_notification_delivery_runs` deliberately retains its Supabase CLI-generated version even though the prerequisite delivery-ledger migration is future-dated. The staging and production migration workflows run `supabase db push --include-all`, which applies this otherwise historical missing version after the ledger migration has already reached the remote project. Confirm the workflow logs list the run-table migration before enabling the application path.
