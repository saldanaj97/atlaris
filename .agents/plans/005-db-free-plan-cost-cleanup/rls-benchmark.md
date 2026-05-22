# RLS Benchmark Notes

Captured: 2026-05-22 21:55 UTC

Scope:

- Database: local Supabase only, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Method: temporary fixture data and `EXPLAIN (ANALYZE, BUFFERS)` inside a transaction, followed by `ROLLBACK`.
- Fixture: one benchmark user, 200 plans, 5 modules per plan, 5 tasks per module, and matching task progress rows.
- Goal: Task 9 evidence only. No RLS policy rewrite was made.

## Representative Results

| Query | Plan summary | Timing |
| --- | --- | ---: |
| Service-role plan list by `user_id`, `created_at desc`, limit 20 | Used `idx_learning_plans_user_created_at_desc`; no sort. | `0.017 ms` |
| Authenticated RLS plan list with same explicit `user_id` filter | Used `idx_learning_plans_user_created_at_desc`; RLS added a small hashed users subplan. | `0.022 ms` |
| Authenticated RLS modules for one plan | Used `modules_plan_id_order_unique`; RLS ownership subplan joined through `learning_plans` and `users`. | `0.084 ms` |
| Authenticated RLS tasks for one plan's modules | Used `tasks_module_id_order_unique`; nested RLS ownership checks were visible but still sub-millisecond on the fixture. | `0.255 ms` |
| Authenticated RLS task progress by explicit `user_id`, limit 20 | Planner chose a seq scan on the small fixture; explicit user filter and RLS user subplan remained cheap. | `0.016 ms` |

## Interpretation

- The current policy shape has visible nested ownership checks for modules/tasks, matching the Supabase Advisor warnings, but the representative local timings are not a proven bottleneck.
- Explicit user/plan filters in query code continue to matter; they let the planner use ownership-aligned indexes before RLS filtering.
- `users.auth_user_id` remains the important policy support index. The local fixture was tiny enough that the planner sometimes used seq scans on `users`, which is not concerning by itself.
- No service-role read replacement is justified. Keep user-owned data reads behind authenticated RLS clients.

## Follow-Up Boundary

Defer RLS policy rewrites. If production-scale traces later show policy overhead as a real bottleneck, open a separate security-reviewed plan for changing policy shape and run the full RLS/security test suite before merging.
