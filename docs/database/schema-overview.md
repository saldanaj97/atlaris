# Database Schema Overview

## Core entities and relationships

```text
users 1—* learning_plans, usage_metrics, ai_usage_events, job_queue, task_progress
learning_plans 1—* modules, generation_attempts
modules 1—* tasks
tasks 1—* task_resources, task_progress
task_resources —* resources
users 1—* oauth_state_tokens
```

## Enums

Defined in `src/lib/db/enums.ts`:

| Enum                   | Values                                           |
| ---------------------- | ------------------------------------------------ |
| `skill_level`          | `beginner`, `intermediate`, `advanced`           |
| `learning_style`       | `reading`, `video`, `practice`, `mixed`          |
| `resource_type`        | `youtube`, `article`, `course`, `doc`, `other`   |
| `progress_status`      | `not_started`, `in_progress`, `completed`        |
| `generation_status`    | `generating`, `pending_retry`, `ready`, `failed` |
| `job_status`           | `pending`, `processing`, `completed`, `failed`   |
| `job_type`             | values sourced from `src/lib/jobs/constants.ts`  |
| `subscription_tier`    | `free`, `starter`, `pro`                         |
| `subscription_status`  | `active`, `canceled`, `past_due`, `trialing`     |
| `plan_origin`          | `ai`, `template`, `manual`, `pdf`                |

## Key constraints

- **Primary keys:** UUID on all user-facing tables
- **User identity:** `users.auth_user_id` is unique and maps the Neon auth identity to the internal `users.id`
- **Email uniqueness:** `users.email` is unique
- **Ownership integrity:** foreign keys generally cascade on delete
- **Ordering integrity:** `unique(plan_id, order)` on modules and `unique(module_id, order)` on tasks
- **Context integrity:** `learning_plans.extracted_context` is validated against the persisted `PdfContext` shape
- **Proof-token integrity:** `oauth_state_tokens.state_token_hash` is unique and reused by PDF extraction proof flows

## Row Level Security (RLS)

RLS is enforced through request-scoped Postgres session state:

- request handlers create authenticated or anonymous RLS clients in `src/lib/db/rls.ts`
- `request.jwt.claims` carries the Neon auth `sub`
- user-facing policies are explicitly scoped to `authenticated`
- service-role access is reserved for tests, workers, migrations, and other system flows

## Frequently referenced indexes

| Table                        | Index / uniqueness                                     |
| ---------------------------- | ------------------------------------------------------ |
| `learning_plans`             | `(user_id, is_quota_eligible, generation_status)`      |
| `modules`                    | `(plan_id, order)`                                     |
| `tasks`                      | `(module_id, order)`                                   |
| `task_progress`              | `(user_id, task_id)`                                   |
| `task_resources`             | `(task_id, resource_id)`                               |
| `job_queue`                  | `(status, scheduled_for, priority)`                    |
| `usage_metrics`              | `(user_id, month)`                                     |
| `ai_usage_events`            | `(user_id, created_at)`                                |
| `oauth_state_tokens`         | `(state_token_hash)`, `(expires_at)`                   |

## Code locations

| Concern          | Location                         |
| ---------------- | -------------------------------- |
| Schema tables    | `src/lib/db/schema/tables/`      |
| Enum definitions | `src/lib/db/enums.ts`            |
| Relations        | `src/lib/db/schema/relations.ts` |
| Query modules    | `src/lib/db/queries/`            |
| Usage tracking   | `src/lib/db/usage.ts`            |
| Migrations       | `src/lib/db/migrations/`         |
| Request DB       | `src/lib/db/runtime.ts`          |
| RLS client       | `src/lib/db/rls.ts`              |
| Service-role DB  | `src/lib/db/service-role.ts`     |

## Implemented feature coverage

- Streaming plan generation and retry tracking
- Attempt auditing with success / failure persistence
- Plan scheduling and task progress tracking
- Monthly usage and billing-related usage accounting
- PDF extraction proof token persistence via `oauth_state_tokens`
