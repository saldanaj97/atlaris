# Email Notification Delivery Runbook

Use this runbook for the optional email notification scheduler only. It does not apply to push, SMS, in-app, campaigns, or user-local-time scheduling.

For the end-user settings model and API contract, see [user-preferences.md](./user-preferences.md).

## Preference model (developer)

Delivery is **opt-in per category**. Defaults are all categories off (`DEFAULT_EMAIL_NOTIFICATION_PREFERENCES` in `src/shared/notifications/email-preferences.ts`).

| Layer | Location |
| --- | --- |
| Master switch + categories | `user_email_notification_settings` / `user_email_notification_preferences` (`supabase/schema/tables/user-preferences.ts`) |
| Settings UI | `/settings#notifications` → `NotificationsSection` / `NotificationPreferencesForm` |
| Save API | `PATCH /api/v1/user/preferences/notifications` (`mutation` rate limit) |
| Effective prefs | `resolveEffectiveEmailPreferences()` — when `unsubscribeAllOptionalEmails` is true, every category is treated as off |
| Scheduler send path | `src/features/notifications/email/delivery-service.ts` reads prefs via `getEmailNotificationPreferences` |

### PATCH body (strict)

```json
{
  "unsubscribeAllOptionalEmails": false,
  "weeklySummary": true,
  "dailyReminder": false,
  "streakReminder": true
}
```

Schema: `emailNotificationPreferenceFormValuesSchema` (camelCase form fields map to DB categories `weekly_summary`, `daily_reminder`, `streak_reminder`).

### Public unsubscribe

Signed one-click unsubscribe (RFC 8058) at `GET|POST /api/v1/notifications/email/unsubscribe?token=…`:

- Tokens from `createUnsubscribeToken()` (`src/features/notifications/email/unsubscribe-token.ts`); default TTL **90 days**; secret `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`.
- `GET` is confirmation-only (no mutation). `POST` applies unsubscribe.
- A one-click `POST` must use `Content-Type: application/x-www-form-urlencoded` with exactly one body field: `List-Unsubscribe=One-Click`.
- Route bypasses Clerk auth; authenticates via HMAC token. Still reachable during maintenance (`middleware-policy.ts`).

### Send nuances

- Global kill switch: Vercel Flag `email-notification-delivery` (fail-closed). See [Vercel Flags](../development/environment.md#vercel-flags).
- Live sends require `RESEND_API_KEY`, `RESEND_FROM`, a valid `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` (unpadded base64url encoding of at least 32 random bytes), and production HTTPS `APP_URL` for deeplinks/unsubscribe URLs.
- In a daily pass, a `streak_reminder` can suppress `daily_reminder` for the same user (`suppressed_by_streak_reminder` in `delivery-service.ts`).

### “Why didn’t this user get email?” checklist

1. Category enabled and `unsubscribeAllOptionalEmails` false (effective prefs).
2. Flag `email-notification-delivery` on; `RESEND_API_KEY`, `RESEND_FROM`, and a valid `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` are configured; `APP_URL` is production HTTPS.
3. Recipient has a non-empty email and qualifies for the requested category:
   - Daily reminder: no activity today in the user's local time zone and an incomplete plan.
   - Streak reminder: no activity today and activity on each of the prior three local days.
   - Weekly summary: a Monday run and activity on at least one day in the prior week.
4. Logical run claimed and not stuck (`email_notification_delivery_runs`); ledger row not already terminal (`email_notification_deliveries`).
5. Not suppressed by streak reminder in the same daily pass.

## Schedule and ownership

Vercel Cron owns email invocation through one path:

| Logical run | UTC schedule | Monitor slug |
| --- | --- | --- |
| `daily` (`daily_reminder`, `streak_reminder`) | `0 14 * * *` | `email-notification-delivery-daily` |
| `weekly` (`weekly_summary`) | `30 14 * * 1` | `email-notification-delivery-weekly` |

Vercel Cron can be delayed, missed, or invoked more than once. Hobby precision is hourly, so both Sentry monitors use a 60-minute check-in margin. The application uses the durable `(run_kind, scheduler_date_utc)` key and the per-message delivery ledger to make duplicates safe.

Only one email scheduler may be active. The GitHub workflow `.github/workflows/email-notification-delivery-scheduler.yml` must stay absent while the Vercel Cron entries are enabled.

## Inspect a run

1. In Vercel, inspect the Cron invocation for `GET /api/cron/notifications/email?runKind=daily` or `?runKind=weekly` and record the response's `runId` and `workflowRunId`.
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

## Payload minimization and inventory

Resolved `sent` and `skipped` ledger rows retain their compact idempotency tombstone but must have `provider_request = NULL`. Pending, retryable failed, and `manual_review` rows retain their request because retry/review correctness still depends on it. There is no age-based email-ledger cleanup policy yet.

Inspect only aggregate state while setting that policy; do not select recipient addresses, content, headers, tokens, or `provider_request`:

```sql
SELECT
  status,
  count(*) AS total_rows,
  count(*) FILTER (WHERE provider_request IS NOT NULL) AS rows_with_provider_request,
  min(created_at) AS oldest_created_at,
  min(updated_at) AS oldest_updated_at
FROM email_notification_deliveries
GROUP BY status
ORDER BY status;
```

If a `sent` or `skipped` row has a payload, stop before validating the invariant and resolve the row under the approved operator policy. Do not delete its tombstone.

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

If an expired pending claim has a different current recipient, the ledger enters `manual_review` and retains the original request. Do not replace or resend it automatically: determine whether the provider may have accepted the original delivery first.

1. Inspect the affected ledger rows and resolve the underlying data or provider state.
2. Confirm no unresolved `manual_review` ledger rows remain for the logical run.
3. Trigger the same run with `"action":"replay_reviewed"`.

This action resets the run cursor but retains the logical date and domain delivery keys. Already-terminal ledger rows prevent duplicate sends. Do not use it merely to retry an unknown provider outcome.

## Stop delivery or roll back

- Turn off the `email-notification-delivery` Vercel Flag to stop the cron route before it reserves work and to pause a workflow before its next page.
- If the cron invocation itself is unhealthy, disable the Vercel email Cron entries.
- Do not re-enable the deleted GitHub scheduler as a parallel fallback. Resolve the durable run and resume it through the manual route after correction.

## Deployment checks

Before enabling delivery, apply the run-table migration, deploy the application and `vercel.json`, configure a distinct `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`, and production HTTPS `APP_URL`, confirm exactly two Vercel email Cron entries, and make a disabled-path check. Then exercise one opted-in safe account and verify the run, workflow, monitor, and ledger correlation.

`20260710151930_create_email_notification_delivery_runs` deliberately retains its Supabase CLI-generated version even though the prerequisite delivery-ledger migration is future-dated. The staging and production migration workflows include both migrations in the explicit `expand` safe list. Confirm the workflow logs list both before enabling the application path.
