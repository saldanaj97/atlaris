# Database Schema Overview

## Core Entities & Relationships

```
users 1—* learning_plans, integration_tokens, usage_metrics, ai_usage_events, job_queue, task_progress
learning_plans 1—* modules, plan_schedules, plan_generations, generation_attempts
modules 1—* tasks
tasks 1—* task_resources, task_progress, task_calendar_events
task_resources —* resources (many-to-many with ordering and notes)
```

## Database Enums

Defined in `src/lib/db/enums.ts`:

| Enum                   | Values                                 |
| ---------------------- | -------------------------------------- |
| `skill_level`          | beginner, intermediate, advanced       |
| `learning_style`       | reading, video, practice, mixed        |
| `resource_type`        | youtube, article, course, doc, other   |
| `progress_status`      | not_started, in_progress, completed    |
| `generation_status`    | generating, ready, failed              |
| `job_status`           | pending, processing, completed, failed |
| `job_type`             | plan_generation, plan_regeneration     |
| `subscription_tier`    | free, starter, pro                     |
| `subscription_status`  | active, canceled, past_due, trialing   |
| `integration_provider` | notion, google_calendar                |

## Key Constraints

- **Primary Keys**: UUID on all tables; `users.id` is internal PK
- **Unique Constraints**: `users.clerk_user_id`, `users.email`
- **Foreign Keys**: Generally `ON DELETE CASCADE`
- **Ordering**: `unique(plan_id, order)` on modules; `unique(module_id, order)` on tasks (order starts at 1)
- **CHECK Constraints**: Non-negative integers for `weekly_hours`, `estimated_minutes`, `duration_minutes`, `cost_cents`, `attempts`, `max_attempts`
- **Timestamps**: `created_at` defaults to `now()`; maintain `updated_at` in app logic

## Row Level Security (RLS)

RLS policies enforce tenant isolation using role switching + session variables:

- Request-scoped DB sessions run as `authenticated` or `anonymous` roles (via `src/lib/db/rls.ts`)
- `request.jwt.claims` carries Clerk `sub` for ownership checks
- User-facing policies are explicitly scoped with `to` (no implicit `PUBLIC` policies)
- User-facing app data is authenticated-only; anonymous role does not have app-data read policies

## Common Indexes

| Table             | Index                                             |
| ----------------- | ------------------------------------------------- |
| `learning_plans`  | `(user_id, is_quota_eligible, generation_status)` |
| `modules`         | `(plan_id, order)`                                |
| `tasks`           | `(module_id, order)`                              |
| `task_progress`   | `(user_id, task_id)`                              |
| `resources`       | `(type)`                                          |
| `task_resources`  | `(task_id, resource_id)`                          |
| `job_queue`       | `(status, scheduled_for, priority)`               |
| `usage_metrics`   | `(user_id, month)`                                |
| `ai_usage_events` | `(user_id, created_at)`                           |

## Code Locations

| Component      | Location                                                                   |
| -------------- | -------------------------------------------------------------------------- |
| Schema         | `src/lib/db/schema/tables/`                                                |
| Enums          | `src/lib/db/enums.ts`                                                      |
| Relations      | `src/lib/db/schema/relations.ts`                                           |
| Queries        | `src/lib/db/queries/`                                                      |
| Usage tracking | `src/lib/db/usage.ts`                                                      |
| Seeding        | `src/lib/db/seed.ts`, `src/lib/db/seed-cli.ts`                             |
| Migrations     | `src/lib/db/migrations/`                                                   |
| Clients        | `src/lib/db/runtime.ts`, `src/lib/db/rls.ts`, `src/lib/db/service-role.ts` |

## Implemented Features

- Stripe subscription billing with webhook handling
- Streaming plan generation via `/api/v1/plans/stream`
- Row Level Security (RLS) with Neon for multi-tenant isolation
- Usage tracking and quotas (monthly limits, AI API usage)
- Third-party integrations: Notion exports, Google Calendar sync
- Plan scheduling and regeneration tracking
- OAuth token management for integrations
