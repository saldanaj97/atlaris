# Email Notification Delivery Runbook

Use this runbook for the optional email notification scheduler only. It does not apply to push, SMS, in-app, campaigns, or user-local-time scheduling.

For the end-user settings model and API contract, see [user-preferences.md](./user-preferences.md).

## Preference model (developer)

Delivery is **opt-in per category**. Defaults are all categories off (`DEFAULT_EMAIL_NOTIFICATION_PREFERENCES` in `src/shared/notifications/email-preferences.ts`).

| Layer | Location |
| --- | --- |
| Master switch + categories | `user_email_notification_settings` / `user_email_notification_preferences` (`supabase/schema/tables/user-preferences.ts`) |
| Settings UI | `/settings/notifications` → `NotificationsSection` / `NotificationPreferencesForm` |
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
- A one-click `POST` accepts `multipart/form-data` or `application/x-www-form-urlencoded`, with exactly one body field: `List-Unsubscribe=One-Click`.
- Route bypasses Clerk auth; authenticates via HMAC token. Still reachable during maintenance (`middleware-policy.ts`).

### Send nuances

- Kill switches differ by trigger. The Worker sends only when `WORKER_ENV` is `production` and the Flagship flag `jobs-paused` is off; that covers scheduled firings, the Worker's manual command, and every page step. The Flagship flag `email-notification-delivery` (fail-closed) gates only the app's manual maintenance route. DEV-193 replaced the `JOB_EMAIL_DELIVERY_ENABLED` switch (on in production, off on staging) with the production check. See [Feature flags](../development/environment.md#feature-flags-cloudflare-flagship).
- Live sends require `RESEND_API_KEY`, `RESEND_FROM`, a valid `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` (unpadded base64url encoding of at least 32 random bytes), and production HTTPS `APP_URL` for deeplinks/unsubscribe URLs.
- In a daily pass, a `streak_reminder` can suppress `daily_reminder` for the same user (`suppressed_by_streak_reminder` in `delivery-service.ts`).

### “Why didn’t this user get email?” checklist

1. Category enabled and `unsubscribeAllOptionalEmails` false (effective prefs).
2. For scheduled runs, the production Worker with the `jobs-paused` flag off (the `email-notification-delivery` flag matters only for a manual trigger); `RESEND_API_KEY`, `RESEND_FROM`, and a valid `EMAIL_UNSUBSCRIBE_TOKEN_SECRET` are configured; `APP_URL` is production HTTPS.
3. Recipient has a non-empty, current Clerk-projected email and qualifies for the requested category. The Clerk watermark orders lifecycle projections; it does not exclude an otherwise valid existing recipient:
   - Daily reminder: no activity today in the user's local time zone and an incomplete plan.
   - Streak reminder: no activity today and activity on each of the prior three local days.
   - Weekly summary: a Monday run and activity on at least one day in the prior week.
4. Logical run claimed and not stuck (`email_notification_delivery_runs`); ledger row not already terminal (`email_notification_deliveries`). Before provider delivery, the worker rechecks the recipient's current email/deletion identity and effective preferences.
5. Not suppressed by streak reminder in the same daily pass.

## Schedule and ownership

The jobs Worker's Workflow schedules own email invocation. The Vercel Cron entries, `GET /api/cron/notifications/email`, and `CRON_SECRET` were removed in B7a (JCS-134).

| Logical run | UTC schedule | Monitor slug |
| --- | --- | --- |
| `daily` (`daily_reminder`, `streak_reminder`) | `0 14 * * *` | none (see Monitoring below) |
| `weekly` (`weekly_summary`) | `30 14 * * MON` | none (see Monitoring below) |

A schedule can fire late, be missed, or fire more than once. The application uses the durable `(run_kind, scheduler_date_utc)` key and the per-message delivery ledger to make duplicates safe.

Only one email scheduler may be active. The GitHub workflow `.github/workflows/email-notification-delivery-scheduler.yml` must stay absent.

## Cloudflare Worker owner (Track B, B3b)

The jobs Worker (`workers/jobs`) is the only email scheduler. It uses the run table, ledger, and domain code (`runEmailNotificationDelivery`). Design: [cloudflare-jobs-runtime.md](./cloudflare-jobs-runtime.md), Decisions 4, 7, 8, and 9.

| Item | Worker behavior |
| --- | --- |
| Trigger | Workflow `atlaris-email-delivery-<env>` (class `EmailDeliveryWorkflow`) with `schedules` `0 14 * * *` (daily) and `30 14 * * MON` (weekly; Cloudflare numbers weekdays from 1 = Sunday, so never `* * 1`) |
| Gate              | Production Worker and `jobs-paused` off, read inside the `claim-run` and page steps; `email-notification-delivery` is not read on the scheduled path. A paused or non-production firing exits before reserving work                                                          |
| Run key | The first step (`claim-run`) derives `runKind` and `schedulerDateUtc` from `event.schedule`, reserves `(run_kind, scheduler_date_utc)`, and claims it. A duplicate firing exits without sending |
| Pages | One step per page (`page-<n>`), 20 recipients each, to stay under the Free plan's 50 external subrequests per step. At most 1,024 steps per instance, so about 20,000 recipients per run |
| Retries | Each step retries 3 times. The delay is the domain's `retryAfter` (60 seconds for provider back-off, the 15-minute lease for an unknown send outcome). The last attempt fails the run (`retry_exhausted`); permanent failures fail it at once. Nothing resends automatically |
| Pause | Each page checks `jobs-paused` (and the production check) before any Resend call. Paused → the run becomes `paused` (`delivery_switch_disabled`); resume it with the `resume` command |
| `workflow_run_id` | `cf:<Cloudflare instance ID>` |
| Monitoring | No Sentry cron monitors (org at capacity). Failed and `needs_review` runs are reported with `captureException`, tags `job: email-delivery`, `runtime: cloudflare-worker`. Inspect instances in the Workflows dashboard by the ID after `cf:` |

**Staging safe recipients.** Staging Worker email is off by design: `isEmailDeliveryEnabled` in `workers/jobs/src/switches.ts` returns false outside production, and turning it on needs a code change there. The allowlist stays as defense in depth for that case. When `WORKER_ENV` is not `production`, only addresses in the staging Worker secret `EMAIL_TEST_RECIPIENT_ALLOWLIST` (comma-separated, case-insensitive) may receive email. Set it with `pnpm exec cf workers secrets update EMAIL_TEST_RECIPIENT_ALLOWLIST --worker atlaris-jobs-staging --text "<addresses>"` from `workers/jobs`, never in `workers/jobs/cloudflare.config.ts`: a plain-text variable outside the config does not survive a `cf deploy`, and a secret cannot reuse the name of an existing plain-text variable (API error 10053), so convert a leftover plain-text variable in place rather than deleting it first ([design note, Decision 7](./cloudflare-jobs-runtime.md#decision-7-cutover-and-pause)). Staging's allowlist has been a Worker secret since 2026-10-14. Other recipients are counted as `skipped` without a ledger row, so they are never marked sent. If the secret is missing or empty, the page sends nothing, logs `test_recipient_allowlist_missing`, and pauses the run (`test_recipient_allowlist_missing`); set the secret and `resume`. Production ignores it.

**Manual command.** `POST /v1/email-delivery/runs` on the Worker hostname, signed per Decision 4, with body `{ "v": 1, "runKind": "daily", "schedulerDateUtc": "2026-07-10", "action": "start" | "resume" | "replay_reviewed" }`. The app's manual route forwards to it with the same validation and state rules. The instance ID is `email-<runId>-<run updated_at in ms>`, so a repeated command for the same queued run is a duplicate and each resume gets a new instance.

| Response | Meaning |
| --- | --- |
| `202 { accepted, instanceId, runId }` | Workflow started |
| `503 { code: "workflow_instance_abandoned" }` | The instance for this unclaimed run already exists but ended (`errored`, `terminated`, or `complete`) without claiming it, so nothing will run it. The run is marked `failed`; `resume` it. If another request claimed or finished the run first, the response is instead the `200` existing-run response below |
| `200 { accepted, duplicate: true, runId, … }` | The run already exists (an existing run also returns `status` and `instanceId`, its persisted `workflow_run_id`, null if unclaimed) in a state that needs no new instance, the unclaimed run's instance already exists and is still live (`running`, `queued`, `waiting`, or `paused`), or `replay_reviewed` still has unresolved `manual_review` rows |
| `400 { error: "invalid_body" }` | Body, date, Monday rule, or future `start` date invalid |
| `409 { code: "invalid_run_state" }` | Action does not fit the run's state |
| `503 { code: "jobs_paused" \| "job_disabled" \| "workflow_start_failed" }` | `jobs-paused` is on, the Worker is not production (staging email is off by design), or the instance could not be created (the run is marked `failed`; `resume` it) |

The app's manual route (`/api/internal/maintenance/notifications/email`) checks the `email-notification-delivery` Flagship flag, then sends this command with `dispatchEmailDeliveryToWorker` (`JOBS_WORKER_URL`, `JOBS_SIGNING_SECRET`). It is for manual operations only; the Worker's schedules run the daily and weekly sends.

**Switches.** Scheduled delivery runs on the production Worker only. Staging email is off by design and never sends from the Worker; turning it on needs a code change in `workers/jobs/src/switches.ts`, plus `EMAIL_TEST_RECIPIENT_ALLOWLIST`. To stop delivery, turn the `jobs-paused` flag on, which pauses every Worker job; you flip it in the Flagship dashboard (app `atlaris-plan-generation`), never from Git. The run key and ledger prevent double-sending across restarts.

## Inspect a run

1. Find the run in `email_notification_delivery_runs` by `run_kind` and `scheduler_date_utc`, and record its `id` and `workflow_run_id` (`cf:<instance ID>`).
2. Inspect the Cloudflare Workflow instance in the Workflows dashboard by the ID after `cf:` to find the current durable step or retry.
3. Check Sentry for `job: email-delivery` exceptions; failed and `needs_review` runs are reported there.
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

Resolved `sent` and `skipped` ledger rows retain their compact idempotency tombstone but must have `provider_request = NULL`. Contract migration `20260811100300_scrub_resolved_email_delivery_payloads` scrubs historical resolved payloads and validates that invariant. Pending, retryable failed, and `manual_review` rows retain their request because retry/review correctness still depends on it. There is no age-based email-ledger cleanup policy yet: compact tombstones remain until a maximum replay, manual-review, and idempotency period is approved.

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

If a `sent` or `skipped` row has a payload, treat it as an invariant breach and incident. Do not delete its tombstone.

## Trigger a safe manual run

Use the manual recovery route with `MAINTENANCE_WORKER_TOKEN`. It accepts only a code-owned run kind, UTC date, and explicit action.

```bash
curl --fail-with-body \
  --request POST 'https://atlaris.app/api/internal/maintenance/notifications/email' \
  --header "Authorization: Bearer $MAINTENANCE_WORKER_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"runKind":"daily","schedulerDateUtc":"2026-07-10","action":"start"}'
```

For a weekly run, use a Monday UTC date and `"runKind":"weekly"`. A `start` request creates a missing logical run only; an identical request returns the existing run and never starts a second workflow.

## Recover paused or failed work

1. Correct the Worker switch, Resend, configuration, or infrastructure cause (and the Flagship flag too, if the manual route reports `disabled`).
2. Send the same `runKind` and `schedulerDateUtc` with `"action":"resume"`.
3. Confirm the response has a new Workflow instance ID and that the persisted cursor and reference timestamp remain unchanged.

`resume` is only valid for `paused` or `failed` runs. It does not recompute a run's date-dependent eligibility or content.

## Handle `needs_review`

`needs_review` means the run observed an isolated recipient error or an ambiguous provider/idempotency outcome. It is intentionally terminal and does not automatically resend.

If an expired pending claim has a different current recipient, or preferences are disabled after an expired pending claim is reclaimed, the ledger enters `manual_review` and retains the original request. A fresh claim or confirmed failed retry with a stale recipient or disabled preference is skipped before provider delivery. Do not replace or resend an ambiguous request automatically: determine whether the provider may have accepted the original delivery first.

1. Inspect the affected ledger rows and resolve the underlying data or provider state.
2. Confirm no unresolved `manual_review` ledger rows remain for the logical run.
3. Trigger the same run with `"action":"replay_reviewed"`.

This action resets the run cursor but retains the logical date and domain delivery keys. Already-terminal ledger rows prevent duplicate sends. Do not use it merely to retry an unknown provider outcome.

## Stop delivery or roll back

- Turn `jobs-paused` on, as in **Switches** above, to stop scheduled runs before they reserve work and to pause a running instance before its next page. The `email-notification-delivery` flag gates only the manual route.
- Do not re-enable the deleted GitHub scheduler as a parallel fallback. Resolve the durable run and resume it through the manual route after correction.

## Deployment checks

Before enabling delivery, apply the run-table migration, deploy the Worker and the application, configure `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_UNSUBSCRIBE_TOKEN_SECRET`, and production HTTPS `APP_URL`, confirm the Worker's email Workflow schedules, and make a disabled-path check. Then exercise one opted-in safe account and verify the run, Workflow instance, and ledger correlation, and check Workers Logs and Sentry exceptions (`job: email-delivery`) for the run.

`20260710151930_create_email_notification_delivery_runs` deliberately retains its Supabase CLI-generated version even though the prerequisite delivery-ledger migration is future-dated. The staging and production migration workflows include both migrations in the explicit `expand` safe list. Confirm the workflow logs list both before enabling the application path.
