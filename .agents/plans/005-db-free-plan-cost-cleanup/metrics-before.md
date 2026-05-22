# Metrics Before DB Free-Plan Cost Cleanup

Captured: 2026-05-22 21:25 UTC

Scope:

- Projects inspected: `atlaris-dev` (`rvkbcnmarjxofgxmqtit`) and `atlaris-prod` (`bszdwweuhxjyueczjegl`).
- Source: read-only Supabase MCP `execute_sql` plus Performance Advisor.
- No connection URLs, keys, row data, or secrets were captured.
- No migration decisions are approved by this file alone; this is baseline evidence for later Task 4+ work.

## Baseline Checks

- `git status --short`: clean before implementation.
- `pnpm check:type`: passed.
- `pnpm exec vitest run --project integration tests/integration/stripe/usage.spec.ts`: passed, 15 tests.
- `pnpm exec vitest run --project integration tests/integration/db/usage.spec.ts`: passed, 5 tests.

## Source Refresh Summary

- Supabase Inspect docs still list `table-sizes`, `index-sizes`, `index-usage`, `unused-indexes`, `bloat`, `calls`, and `outliers` as the relevant inspection commands. Many require `pg_stat_statements`.
- Supabase Performance Advisor still reports `unused_index`, `duplicate_index`, and RLS init-plan warnings.
- Supabase free-plan database size is based on actual Postgres data, including indexes and materialized views. Free projects enter read-only mode past the database-size quota.
- Next.js App Router docs still support starting a promise in a Server Component/page and passing it through Suspense boundaries.
- React `cache()` remains request-scoped for Server Components. A local shared promise is still the more explicit Task 1 fix.
- PostgreSQL docs confirm `SELECT ... FOR UPDATE` locks returned rows until transaction end, while `INSERT ... ON CONFLICT` provides per-row conflict handling suitable for idempotent ensures.

## Table Size Snapshot

`atlaris-dev` largest public relations by total size:

| Table | Total bytes | Table bytes | Index bytes |
| --- | ---: | ---: | ---: |
| `learning_plans` | 98,304 | 8,192 | 81,920 |
| `users` | 98,304 | 8,192 | 81,920 |
| `task_progress` | 90,112 | 8,192 | 81,920 |
| `modules` | 81,920 | 8,192 | 65,536 |
| `ai_usage_events` | 81,920 | 8,192 | 65,536 |
| `usage_metrics` | 81,920 | 8,192 | 65,536 |
| `tasks` | 81,920 | 8,192 | 65,536 |
| `generation_attempts` | 65,536 | 8,192 | 49,152 |
| `job_queue` | 49,152 | 0 | 40,960 |
| `task_resources` | 40,960 | 0 | 32,768 |

`atlaris-prod` largest public relations by total size:

| Table | Total bytes | Table bytes | Index bytes |
| --- | ---: | ---: | ---: |
| `job_queue` | 49,152 | 0 | 40,960 |
| `users` | 49,152 | 0 | 40,960 |
| `learning_plans` | 49,152 | 0 | 40,960 |
| `task_resources` | 40,960 | 0 | 32,768 |
| `modules` | 40,960 | 0 | 32,768 |
| `ai_usage_events` | 40,960 | 0 | 32,768 |
| `task_progress` | 40,960 | 0 | 40,960 |
| `usage_metrics` | 40,960 | 0 | 32,768 |
| `tasks` | 40,960 | 0 | 32,768 |
| `stripe_webhook_events` | 32,768 | 0 | 24,576 |

## Index Usage Snapshot

`atlaris-dev` indexes with meaningful observed scans:

| Index | Table | idx_scan | idx_tup_read | idx_tup_fetch |
| --- | --- | ---: | ---: | ---: |
| `users_auth_user_id_unique` | `users` | 891 | 889 | 889 |
| `learning_plans_pkey` | `learning_plans` | 487 | 491 | 487 |
| `modules_pkey` | `modules` | 424 | 424 | 424 |
| `idx_learning_plans_user_origin` | `learning_plans` | 267 | 607 | 3 |
| `idx_tasks_module_id_order` | `tasks` | 140 | 473 | 430 |
| `idx_modules_plan_id_order` | `modules` | 120 | 301 | 296 |
| `users_pkey` | `users` | 107 | 108 | 108 |
| `idx_task_progress_user_task` | `task_progress` | 87 | 200 | 200 |
| `idx_generation_attempts_plan_id` | `generation_attempts` | 73 | 69 | 68 |
| `usage_metrics_user_id_month_unique` | `usage_metrics` | 63 | 62 | 62 |

`atlaris-dev` zero-scan examples relevant to the plan:

- `idx_modules_plan_id`
- `tasks_module_id_order_unique`
- `idx_tasks_module_id`
- `idx_usage_metrics_user_id`
- `idx_usage_metrics_month`
- `idx_ai_usage_user_id`
- `idx_ai_usage_created_at`
- `idx_ai_usage_events_user_created_at`
- `idx_job_queue_status_scheduled_priority`
- `idx_job_queue_user_id`
- `idx_job_queue_created_at`
- `idx_plan_schedules_inputs_hash`
- `oauth_state_tokens_hash_idx`
- `oauth_state_tokens_expires_at_idx`

`atlaris-prod` is mostly empty/low-traffic in this snapshot; nearly all public indexes have `idx_scan = 0` except `ai_usage_events_pkey` with one scan. Treat prod unused-index signals as weak evidence until real traffic exists.

## Top pg_stat_statements Snapshot

Both projects are dominated by Supabase dashboard/metadata/backup queries, not Atlaris application queries. The highest-total-time statements include:

- `pg_available_extensions` metadata queries.
- `pg_timezone_names`.
- backup start/stop queries.
- dashboard schema/table metadata queries.
- `SHOW transaction_read_only`.

No Task 4+ index decision should rely on top statement data from this low-traffic baseline alone.

## Performance Advisor Summary

`atlaris-dev`:

- RLS init-plan warnings across user-owned tables and policies. This aligns with Task 9 and should not be changed without a dedicated RLS benchmark/security pass.
- Unused-index lints include several planned candidates such as `idx_modules_plan_id`, `idx_tasks_module_id`, `idx_usage_metrics_user_id`, `idx_usage_metrics_month`, `idx_job_queue_*`, `idx_plan_schedules_inputs_hash`, `idx_ai_usage_*`, and OAuth/resource/task-resource indexes.

`atlaris-prod`:

- RLS init-plan warnings across the same policy families, including broader insert/update/delete policy coverage.
- Unused-index lints include many planned candidates, but low traffic makes this a weak standalone signal.

## Initial Interpretation

- Code-proven waste in Tasks 1-3 can proceed without schema changes.
- Index cleanup remains gated. Dev has useful local usage signal for `idx_modules_plan_id_order`, `idx_tasks_module_id_order`, `users_auth_user_id_unique`, `usage_metrics_user_id_month_unique`, and plan-origin reads.
- Prod is too empty to justify destructive index changes by usage counters alone.
- RLS Advisor warnings are documented, but policy rewrites stay deferred until Task 9 benchmark work.

## Task 4-6 Index Decisions

Additional local verification used `postgresql://postgres:postgres@127.0.0.1:54322/postgres` after local reset. Temporary seed data and candidate indexes were created inside transactions and rolled back.

| Index | Decision | Rationale |
| --- | --- | --- |
| `idx_modules_plan_id` | Drop | Left-prefix covered by unique `(plan_id, "order")`; supports FK lookups without a duplicate single-column index. |
| `idx_modules_plan_id_order` | Drop | Exact non-unique duplicate of `modules_plan_id_order_unique`. |
| `idx_tasks_module_id` | Drop | Left-prefix covered by unique `(module_id, "order")`; supports FK lookups without a duplicate single-column index. |
| `idx_tasks_module_id_order` | Drop | Exact non-unique duplicate of `tasks_module_id_order_unique`. |
| `idx_task_resources_task_id` | Drop | Left-prefix covered by unique `(task_id, resource_id)`. |
| `idx_usage_metrics_user_id` | Drop | Usage metrics reads/writes use `(user_id, month)`; unique composite covers the active access path and user-only left-prefix lookups. |
| `idx_usage_metrics_month` | Drop | No production code path filters by month alone; monthly test ordering is not a production access path. |
| `idx_ai_usage_user_id` | Drop | Covered by left-prefix of `(user_id, created_at)`; keep `idx_ai_usage_created_at` for retention/time-window work. |
| `idx_plan_schedules_inputs_hash` | Drop | Schedule cache reads are keyed by `plan_id` primary key; `inputs_hash` is compared after lookup and is not queried directly. |
| `idx_learning_plans_user_id` | Replace | Local EXPLAIN with 5,000 rows showed `WHERE user_id ORDER BY created_at DESC LIMIT 20` changed from seq scan + top-N sort (`0.777 ms`) to `idx_learning_plans_user_created_at_desc` index scan (`0.027 ms`). |
| `idx_job_queue_status_scheduled_priority` | Replace | Local EXPLAIN with 10,000 queued rows showed queue claim changed from seq scan + sort (`1.671 ms`) to `idx_job_queue_pending_claim` partial index scan (`0.018 ms`). |
| `idx_job_queue_plan_id` | Keep | Full `plan_id` index remains useful for FK/cascade support and tests/admin lookups; active-regeneration partial replacement would add net index cost. |
| `idx_job_queue_user_id` | Keep | Full `user_id` index remains useful for FK/cascade support and user/job counting. |
| `idx_job_queue_created_at` | Keep | Monitoring and count windows filter by `created_at`; retention work also benefits from a time index. |
| Duplicate-topic expression index | Defer | The duplicate detection window is small and not proven costly; no `lower(topic)` index added. |

Migration: `supabase/migrations/20260522214809_db_cost_index_cleanup.sql`.

Local validation:

- `pnpm check:type`: passed after Drizzle schema edits.
- `pnpm db:dev:reset`: passed and applied `20260522214809_db_cost_index_cleanup.sql` locally only.
- Local post-reset index verification showed only the new `idx_learning_plans_user_created_at_desc` and `idx_job_queue_pending_claim` among the replacement/drop set.
- `pnpm exec vitest run --project integration tests/integration/db/jobs.queue.spec.ts`: passed, 10 tests.
- `pnpm exec vitest run --project integration tests/integration/db/usage.spec.ts`: passed, 8 tests.
- `pnpm test:security`: passed, 30 tests.
