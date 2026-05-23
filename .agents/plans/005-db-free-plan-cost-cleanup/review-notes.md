# DB Free-Plan Cost Cleanup Review Notes

## Local commits

- `b046c143 fix(billing): remove code-proven usage waste`
- `9bcade18 chore(db): guard service-role import boundaries`
- `01631ae4 refactor(db): replace measured redundant indexes`
- `4e454e6c feat(db): add retention cleanup boundaries`
- `c6ddac07 docs(db): record RLS benchmark evidence`

No commits were pushed at initial review time; work was subsequently merged to `develop` and `main` via PRs #337 and #338.

## Before/after evidence

- Phase 1 removed code-proven waste: `/plans` now shares one page-data promise, usage summary reads no longer create current-month rows, and metered reservations avoid a duplicate usage-row ensure.
- Guardrail: `.oxlintrc.json` blocks `@supabase/service-role` imports in request-layer paths (`src/app`, `src/lib/api`, `src/lib/integrations`).
- Index cleanup: local EXPLAIN evidence in `metrics-before.md` supports replacing the plan-list and pending-queue claim indexes, while duplicate/left-prefix indexes were removed only where a unique composite or active access path still covers the query/FK need.
- Retention: `src/lib/db/queries/admin/retention.ts` adds service-owned cleanup for expired OAuth state tokens, old Stripe webhook event IDs, and old terminal job rows. Raw AI usage events are explicitly retained until aggregation exists.
- RLS: `rls-benchmark.md` records local authenticated RLS timings and keeps policy rewrites deferred.

## Migration rollback

Migration: `supabase/migrations/0034_strong_marten_broadcloak.sql`.

If the index migration needs rollback, reverse the replacement in a new migration:

1. Drop `idx_learning_plans_user_created_at_desc` and recreate `idx_learning_plans_user_id`.
2. Drop `idx_job_queue_pending_claim` and recreate `idx_job_queue_status_scheduled_priority` on `(status, scheduled_for, priority)`.
3. Recreate dropped redundant indexes only if a production plan shows a regression:
   - `idx_modules_plan_id`
   - `idx_modules_plan_id_order`
   - `idx_tasks_module_id`
   - `idx_tasks_module_id_order`
   - `idx_task_resources_task_id`
   - `idx_usage_metrics_user_id`
   - `idx_usage_metrics_month`
   - `idx_ai_usage_user_id`
   - `idx_plan_schedules_inputs_hash`

## Validation run

Targeted validation already completed during slices:

- `pnpm check:lint`
- `pnpm check:type`
- `pnpm test:security`
- `pnpm db:dev:reset`
- `pnpm exec vitest run --project integration tests/integration/db/jobs.queue.spec.ts`
- `pnpm exec vitest run --project integration tests/integration/db/usage.spec.ts`
- `pnpm exec vitest run --project integration tests/integration/db/retention-cleanup-function.spec.ts`
- `pnpm exec vitest run --project integration tests/integration/api/retention-cleanup-process.spec.ts`

Final validation is tracked in `todos.md`.

Final pass:

- `pnpm test:changed`: passed.
- `pnpm check:full`: passed.
- `git diff --check`: passed.
- `git diff -- supabase/config.toml`: empty.
