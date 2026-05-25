# Database Schema Overview

## Core entities and relationships

```text
users 1—* learning_plans, usage_metrics, ai_usage_events, job_queue, task_progress
learning_plans 1—* modules, generation_attempts
modules 1—* tasks   (module row holds `lesson_generation_*` batch state; no separate lesson-run table)
tasks 1—* task_resources, task_progress   (`tasks.lesson_content` = structured lesson blocks)
task_resources —* resources
users 1—* oauth_state_tokens
```

## Enums

Defined in `supabase/enums.ts`:

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

## Key constraints

- **Primary keys:** UUID on all user-facing tables
- **User identity:** `users.auth_user_id` is unique and maps the Clerk auth identity to the internal `users.id`
- **Email uniqueness:** `users.email` is unique
- **Ownership integrity:** foreign keys generally cascade on delete
- **Ordering integrity:** `unique(plan_id, order)` on modules and `unique(module_id, order)` on tasks

## Row Level Security (RLS)

RLS is enforced through request-scoped Postgres session state:

- request handlers create authenticated or anon-role RLS clients in `supabase/rls.ts`
- `request.jwt.claims` carries the Clerk auth `sub`
- user-facing policies are explicitly scoped to `authenticated`
- service-role access is reserved for tests, workers, migrations, and other system flows

## Frequently referenced indexes

Authoritative definitions live in `supabase/schema/tables/*.ts` and applied migrations under `supabase/migrations/`.

| Table                | Index / uniqueness                                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learning_plans`     | `(user_id, created_at desc)`; `(user_id, generation_status)`; `(user_id, origin)`; `(user_id, is_quota_eligible, generation_status)`                                                                                                                                           |
| `modules`            | `UNIQUE (plan_id, order)` (no standalone `(plan_id)` btree after migration `0034`)                                                                                                                                                                                            |
| `tasks`              | `UNIQUE (module_id, order)` (no standalone `(module_id)` btree after `0034`)                                                                                                                                                                                                    |
| `task_progress`      | `(user_id, task_id)`                                                                                                                                                                                                                                                          |
| `task_resources`     | `UNIQUE (task_id, resource_id)`; `(resource_id)` btree (standalone `(task_id)` btree removed in `0034`)                                                                                                                                                                       |
| `job_queue`          | partial pending claim index on `(job_type, scheduled_for, priority desc, created_at)` (definition recreated in `0034`)                                                                                                                                                        |
| `usage_metrics`      | `UNIQUE (user_id, month)` + PK only at btree level after `0034` dropped redundant `(user_id)` / `(month)` indexes; `lesson_modules_generated` meters successful module lesson batches                                                                                         |
| `ai_usage_events`    | `(user_id, created_at)`; `(created_at)`; standalone `(user_id)` btree removed in `0034`                                                                                                                                                                                         |
| `oauth_state_tokens` | `(state_token_hash)`, `(expires_at)`                                                                                                                                                                                                                                          |

Migration `0034_strong_marten_broadcloak.sql` removed redundant btree indexes where uniqueness or composite indexes already covered the same access patterns (see integration expectations in `tests/integration/db/stripe.schema.spec.ts` for `usage_metrics`).

## Ownership and retention

- `oauth_state_tokens` is retained as integration infrastructure for future multi-instance OAuth flows. Expired rows are deleted by `private.cleanup_retained_db_rows()` via Supabase Cron.
- `resources` and `task_resources` are active read surfaces for plan detail/resource display. A production writer is still a product follow-up; the tables are not removed while the UI/API read surface exists.
- `job_queue` keeps active jobs indefinitely while terminal `completed`/`failed` rows older than 30 days are deleted by `private.cleanup_retained_db_rows()` via Supabase Cron.
- `stripe_webhook_events` keeps event IDs for 45 days to cover Stripe automatic retries plus manual resend windows before `private.cleanup_retained_db_rows()` prunes old idempotency rows.
- `ai_usage_events` raw rows are retained until a monthly aggregation/accounting model exists; do not delete them as a generic log cleanup.

Scheduled invocation: Supabase Cron runs `private.cleanup_retained_db_rows()` daily. Manual operator fallback: `POST /api/internal/maintenance/retention/cleanup` (see `docs/architecture/retention-cleanup-runbook.md`).

## Code locations

| Concern                  | Location                                         |
| ------------------------ | ------------------------------------------------ |
| Schema tables            | `supabase/schema/tables/`                        |
| Enum definitions         | `supabase/enums.ts`                              |
| Relations                | `supabase/schema/relations.ts`                   |
| Query modules            | `src/lib/db/queries/`                            |
| Retention SQL + TS bridge | `supabase/migrations/20260522223908_schedule_retention_cleanup.sql` (`private.cleanup_retained_db_rows`), `src/lib/db/queries/admin/retention.ts` (`cleanupRetainedDbRows`) |
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
- Monthly usage and billing-related usage accounting (including `lesson_modules_generated` on `usage_metrics`)
- On-demand **module** lesson batch generation: `modules.lesson_generation_*` lifecycle plus `tasks.lesson_content` JSON payloads (see `docs/architecture/plan-generation-architecture.md`)
