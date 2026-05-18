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

| Enum                  | Values                                           |
| --------------------- | ------------------------------------------------ |
| `skill_level`         | `beginner`, `intermediate`, `advanced`           |
| `learning_style`      | `reading`, `video`, `practice`, `mixed`          |
| `resource_type`       | `youtube`, `article`, `course`, `doc`, `other`   |
| `progress_status`     | `not_started`, `in_progress`, `completed`        |
| `generation_status`   | `generating`, `pending_retry`, `ready`, `failed` |
| `lesson_generation_status` | `not_generated`, `generating`, `ready`, `failed` (per **module**; separate from plan `generation_status`) |
| `job_status`          | `pending`, `processing`, `completed`, `failed`   |
| `job_type`            | values sourced from `src/lib/jobs/constants.ts`  |
| `subscription_tier`   | `free`, `starter`, `pro`                         |
| `subscription_status` | `active`, `canceled`, `past_due`, `trialing`     |
| `plan_origin`         | `ai`, `template`, `manual`                       |

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

| Table                | Index / uniqueness                                |
| -------------------- | ------------------------------------------------- |
| `learning_plans`     | `(user_id, is_quota_eligible, generation_status)` |
| `modules`            | `(plan_id, order)`                                |
| `tasks`              | `(module_id, order)`                              |
| `task_progress`      | `(user_id, task_id)`                              |
| `task_resources`     | `(task_id, resource_id)`                          |
| `job_queue`          | `(status, scheduled_for, priority)`               |
| `usage_metrics`      | `(user_id, month)` unique; `lesson_modules_generated` counts successful module lesson batches (billing meter) |
| `ai_usage_events`    | `(user_id, created_at)`                           |
| `oauth_state_tokens` | `(state_token_hash)`, `(expires_at)`              |

## Code locations

| Concern          | Location                       |
| ---------------- | ------------------------------ |
| Schema tables    | `supabase/schema/tables/`      |
| Enum definitions | `supabase/enums.ts`            |
| Relations        | `supabase/schema/relations.ts` |
| Query modules    | `src/lib/db/queries/`          |
| Module lesson generation | `src/lib/db/queries/module-lesson-generation.ts` |
| Usage tracking   | `supabase/usage.ts`            |
| Migrations       | `supabase/migrations/`         |
| Request DB       | `supabase/runtime.ts`          |
| RLS client       | `supabase/rls.ts`              |
| Service-role DB  | `supabase/service-role.ts`     |

## Implemented feature coverage

- Streaming plan generation and retry tracking
- Attempt auditing with success / failure persistence
- Plan scheduling and task progress tracking
- Monthly usage and billing-related usage accounting (including `lesson_modules_generated` on `usage_metrics`)
- On-demand **module** lesson batch generation: `modules.lesson_generation_*` lifecycle plus `tasks.lesson_content` JSON payloads (see `docs/architecture/plan-generation-architecture.md`)
