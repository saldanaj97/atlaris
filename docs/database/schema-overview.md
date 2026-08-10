# Database Schema Overview

## Core entities and relationships

```text
users 1—* learning_plans, usage_metrics, ai_usage_events, job_queue, task_progress
users 1—1 user_preferences
users 1—1 user_email_notification_settings
users 1—* user_email_notification_preferences   (per email category)
users 1—* learning_activity_events
learning_plans 1—* modules, generation_attempts
modules 1—* tasks   (module row holds `lesson_generation_*` batch state; no separate lesson-run table)
tasks 1—* task_resources, task_progress   (`tasks.lesson_content` = structured lesson blocks)
task_progress status changes → learning_activity_events (DB trigger; server-owned writes)
task_resources —* resources
users 1—* oauth_state_tokens
clerk_webhook_events  (service-owned completed-event idempotency ledger)
clerk_webhook_event_claims  (short-lived service-owned processing claims)
email_notification_delivery_runs  (service-owned scheduler checkpoints)
email_notification_deliveries     (service-owned per-message ledger; deny-all RLS)
```

## Enums

Defined in `supabase/enums.ts` (plus delivery status enums on delivery table modules):

| Enum                       | Values                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `skill_level`              | `beginner`, `intermediate`, `advanced`                                                                    |
| `learning_style`           | `reading`, `video`, `practice`, `mixed`                                                                   |
| `resource_type`            | `video`, `article`, `course`, `doc`, `other`                                                              |
| `progress_status`          | `not_started`, `in_progress`, `completed`                                                                 |
| `generation_status`        | `generating`, `pending_retry`, `ready`, `failed`                                                          |
| `lesson_generation_status` | `not_generated`, `generating`, `ready`, `failed` (per **module**; separate from plan `generation_status`) |
| `job_status`               | `pending`, `processing`, `completed`, `failed`                                                            |
| `job_type`                 | values sourced from `src/lib/jobs/constants.ts`                                                           |
| `subscription_tier`        | `free`, `starter`, `pro`                                                                                  |
| `subscription_status`      | `active`, `canceled`, `past_due`, `trialing`                                                              |
| `plan_origin`              | `ai`, `template`, `manual`                                                                                |
| `preferred_ai_model`       | tier-gated model ids (see AI catalog / settings)                                                          |
| `email_notification_category` | `weekly_summary`, `daily_reminder`, `streak_reminder`                                                  |
| `email_notification_delivery_status` | `pending`, `sent`, `skipped`, `failed`, `manual_review`                                          |
| `email_notification_delivery_run_kind` | `daily`, `weekly`                                                                                |
| `email_notification_delivery_run_status` | `queued`, `running`, `paused`, `completed`, `failed`, `needs_review`                           |

## Key constraints

- **Primary keys:** UUID on all user-facing tables
- **User identity:** `users.auth_user_id` is unique and maps the Clerk auth identity to the internal `users.id`
- **Email uniqueness:** `users.email` is nullable and unique when present; it stores only Clerk's verified primary address
- **Clerk identity projection:** `users.clerk_user_updated_at` rejects stale lifecycle updates; `users.clerk_deleted_at` tombstones a signed Clerk deletion without cascading user data
- **Ownership integrity:** foreign keys generally cascade on delete
- **Ordering integrity:** `unique(plan_id, order)` on modules and `unique(module_id, order)` on tasks
- **Preferences:** `user_preferences.user_id` and `user_email_notification_settings.user_id` are 1:1 with `users`; category prefs use `unique(user_id, category)`
- **Email delivery:** `unique(user_id, category, delivery_key)` on deliveries; `unique(run_kind, scheduler_date_utc)` on runs

## Row Level Security (RLS)

RLS is enforced through request-scoped Postgres session state:

- request handlers create authenticated or anon-role RLS clients in `supabase/rls.ts`
- `request.jwt.claims` carries the Clerk auth `sub`
- user-facing policies are explicitly scoped to `authenticated`
- service-role access is reserved for tests, workers, migrations, and other system flows

Preference / notification preference tables use own-row `select` / `insert` / `update` with authenticated column grants. `learning_activity_events` is authenticated **select-only** (writes via trigger). `clerk_webhook_events`, `email_notification_deliveries`, and `email_notification_delivery_runs` use deny-all RLS (service-role only).

## Frequently referenced indexes

| Table                | Index / uniqueness                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `learning_plans`     | `(user_id, created_at desc)`, `(user_id, is_quota_eligible, generation_status)`                               |
| `modules`            | `(plan_id, order)`                                                                                            |
| `tasks`              | `(module_id, order)`                                                                                          |
| `task_progress`      | `(user_id, task_id)`                                                                                          |
| `task_resources`     | `(task_id, resource_id)`                                                                                      |
| `learning_activity_events` | `(user_id, occurred_at)`, `(user_id, plan_id, occurred_at)`, `(task_id, occurred_at)`                    |
| `job_queue`          | partial pending claim index on `(job_type, scheduled_for, priority desc, created_at)`                         |
| `usage_metrics`      | `(user_id, month)` unique; `lesson_modules_generated` counts successful module lesson batches (billing meter) |
| `ai_usage_events`    | `(user_id, created_at)`                                                                                       |
| `oauth_state_tokens` | `(state_token_hash)`, `(expires_at)`                                                                          |
| `clerk_webhook_events` | `(event_id)` unique, `(created_at)`                                                                         |
| `clerk_webhook_event_claims` | `(event_id)` primary key, `(claim_expires_at)`                                                        |
| `email_notification_deliveries` | `(user_id, category, delivery_key)` unique                                                         |
| `email_notification_delivery_runs` | `(run_kind, scheduler_date_utc)` unique; unique `workflow_run_id` when set                        |

## Ownership and retention

- `oauth_state_tokens` is retained as integration infrastructure for future multi-instance OAuth flows. Expired rows are deleted by `private.cleanup_retained_db_rows()` via Supabase Cron.
- `resources` and `task_resources` are active read surfaces for plan detail/resource display. A production writer is still a product follow-up; the tables are not removed while the UI/API read surface exists.
- `job_queue` keeps active jobs indefinitely while terminal `completed`/`failed` rows older than 30 days are deleted by `private.cleanup_retained_db_rows()` via Supabase Cron.
- `clerk_webhook_events` keeps completed Clerk/Svix delivery IDs for 45 days before `private.cleanup_retained_db_rows()` prunes old idempotency rows.
- `clerk_webhook_event_claims` holds temporary claim tokens while a webhook refreshes Clerk. Successful and failed requests remove their claims; crash leftovers can be reclaimed after the two-minute lease and stale claims are pruned by retention cleanup.
- `ai_usage_events` raw rows are retained until a monthly aggregation/accounting model exists; do not delete them as a generic log cleanup.
- `learning_activity_events` follows FK cascades; there is no separate retention prune for analytics history today.
- Email delivery run/ledger tables are operational state for the scheduler; see [email-notification-delivery-runbook.md](../architecture/email-notification-delivery-runbook.md).

Scheduled invocation: Supabase Cron runs `private.cleanup_retained_db_rows()` daily. Manual operator fallback: `POST /api/internal/maintenance/retention/cleanup` (see `docs/architecture/retention-cleanup-runbook.md`).

## Code locations

| Concern                  | Location                                         |
| ------------------------ | ------------------------------------------------ |
| Schema tables            | `supabase/schema/tables/`                        |
| User preferences         | `supabase/schema/tables/user-preferences.ts`     |
| Email delivery ledgers   | `email-notification-deliveries.ts`, `email-notification-delivery-runs.ts` |
| Learning activity events | `learningActivityEvents` in `tables/tasks.ts`    |
| Enum definitions         | `supabase/enums.ts`                              |
| Relations                | `supabase/schema/relations.ts`                   |
| Query modules            | `src/lib/db/queries/`                            |
| Preference queries       | `src/lib/db/queries/user-preferences.ts`         |
| Module lesson generation | `src/lib/db/queries/module-lesson-generation.ts` |
| Usage tracking           | `supabase/usage.ts`                              |
| Migrations               | `supabase/migrations/`                           |
| Request DB               | `supabase/runtime.ts`                            |
| RLS client               | `supabase/rls.ts`                                |
| Service-role DB          | `supabase/service-role.ts`                       |

## Implemented feature coverage

- Streaming plan generation and retry tracking
- Attempt auditing with success / failure persistence
- Plan scheduling and task progress tracking
- Learning activity history for usage analytics streaks/trends
- User preferences (AI model, analytics timezone) and email notification opt-ins
- Monthly usage and billing-related usage accounting (including `lesson_modules_generated` on `usage_metrics`)
- Clerk Billing entitlement projection + webhook idempotency ledger
- Opted-in email notification preferences and delivery orchestration (flag-gated), with durable delivery ledger/runs (see `docs/architecture/email-notification-delivery-runbook.md`)
- On-demand **module** lesson batch generation: `modules.lesson_generation_*` lifecycle plus `tasks.lesson_content` JSON payloads (see `docs/architecture/plan-generation-architecture.md`)

## Related docs

- [user-preferences.md](../architecture/user-preferences.md)
- [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md)
- [usage-analytics-metric-contract.md](../architecture/usage-analytics-metric-contract.md)
- [client-usage.md](./client-usage.md)
