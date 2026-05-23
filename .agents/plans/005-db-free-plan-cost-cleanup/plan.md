# DB Free-Plan Cost Cleanup

Date: 2026-05-22
Status: planning only

## Review Status - 2026-05-22

Post-implementation verification found the main code-proven cleanup slices implemented and covered by targeted tests. The remaining scheduler gap was resolved by moving recurring retention cleanup into Supabase Cron:

- `/plans` render behavior verified locally on 2026-05-22: anon redirect via smoke test; authenticated empty state, count badge (`0 / 3`), and list state (`1 / 3` with plan row) via browser against `http://127.0.0.1:3000/plans` with local product testing auth.
- Retention cleanup is owned by `private.cleanup_retained_db_rows()` and scheduled by Supabase Cron through migration `20260522223908_schedule_retention_cleanup.sql`. The internal route remains a manual fallback.

## Goal

Reduce avoidable Supabase/Postgres cost pressure while preserving the app's security invariants and making the database layer simpler to reason about.

Primary cost targets:

- Repeated request-boundary work that opens extra authenticated RLS clients.
- Read paths that perform write-shaped "ensure row exists" work.
- Redundant indexes that increase storage, write amplification, and vacuum/index maintenance.
- Tables and columns that exist without an active product owner or retention policy.
- Queue/list queries whose indexes do not match the actual predicates and ordering.

This plan is deliberately gated. The first implementation slice should fix code paths that are visibly redundant in the current tree. Index and table cleanup must be backed by live database evidence before any destructive migration.

## Non-Goals

- Do not rewrite the app around Supabase client-side data access.
- Do not change the request-scoped RLS architecture unless a later benchmark proves the current policy shape is a bottleneck.
- Do not remove OAuth/resources schema only because it looks unused; first classify product ownership and live data.
- Do not drop indexes from production based only on static code reading.
- Do not introduce a generic data-loader framework, cross-route cache, or new ORM abstraction.
- Do not broaden billing, Stripe reconciliation, plan generation, or RLS privilege changes beyond the slices below.

## Current Live Anchors

- Planning artifacts belong under `.agents/plans/`; this package intentionally lives here.
- Migration source of truth is `supabase/migrations`; typed ORM schema lives under `supabase/schema`.
- Drizzle migration config reads `POSTGRES_URL_NON_POOLING || POSTGRES_URL` from `drizzle.config.ts`.
- Request-scoped RLS clients are created through `requestBoundary`/`withServerComponentContext`, then `createAuthenticatedRlsClient`.
- Server-owned write boundaries must stay service-role owned; authenticated browser clients must not regain write privileges on billing/generation state.

Key current files:

- `src/app/(app)/plans/page.tsx`
- `src/app/(app)/plans/components/PlansContent.tsx`
- `src/features/billing/account-snapshot.ts`
- `src/features/billing/usage-metrics.ts`
- `src/features/billing/metered-reservation.ts`
- `src/lib/db/queries/plans.ts`
- `src/lib/db/queries/jobs/mutations.ts`
- `src/lib/db/queries/helpers/jobs-helpers.ts`
- `src/lib/db/queries/schedules.ts`
- `supabase/schema/tables/plans.ts`
- `supabase/schema/tables/tasks.ts`
- `supabase/schema/tables/jobs.ts`
- `supabase/schema/tables/usage.ts`
- `supabase/schema/tables/integrations.ts`
- `supabase/schema/tables/stripe.ts`
- `tests/integration/stripe/usage.spec.ts`
- `tests/integration/db/usage.spec.ts`
- `tests/security/rls.policies.spec.ts`

## External Source Refresh Rules

Before implementing any task below, refresh the specific documentation source listed on that task. Do not rely on this plan's URLs as timeless truth. Use a web search with the source title/URL and the section names listed in the task.

Preferred source order:

1. Official Supabase docs for Supabase/Postgres/RLS/Advisor/Inspect behavior.
2. Official PostgreSQL docs for DDL, indexes, and `EXPLAIN`.
3. Official Drizzle docs for schema/index/migration API behavior.
4. Existing repo docs/tests for Atlaris-specific security boundaries.
5. Secondary research only for LLM failure-pattern context, never as the authority for implementation.

## Grill-Me Validation

The `grill-me` skill normally asks these questions interactively. For this plan, the questions are answered here so the implementer can move without prompting the user again.

### Q1. What is the actual cost problem: storage, queries, writes, or connections?

Answer: all four, but the first slice should target repeated work that is visible without production stats. The `/plans` page duplicates request-boundary work and billing snapshot reads. Usage summary reads can perform an insert-on-conflict. Those are clear, localized waste. Index drops and table removals need live stats because static analysis cannot prove production usage.

### Q2. Why not start by dropping indexes?

Answer: indexes are easy to misclassify from code reading. A foreign key child-column index, a left-prefix composite, or a rarely used admin query can be invisible in a quick scan. The safe path is to collect `pg_stat_user_indexes`, relation sizes, Supabase Advisor output, and query plans first. Exact duplicate indexes can be prioritized, but even those should be migrated deliberately.

### Q3. Which findings are high-confidence enough to implement first?

Answer:

1. Share `/plans` page data loading so `getBillingAccountSnapshot` is computed once per render.
2. Make usage summary reads read-only and treat missing current-month metrics as zero.
3. Remove the duplicate usage-row ensure inside the metered reservation transaction.

These do not depend on live production row counts and can be validated with focused tests.

### Q4. Is React `cache()` the right fix for `/plans` duplication?

Answer: probably not as the first move. The cleaner move is to make the page own one `loadPlansPageData()` promise and pass that promise to the badge and content. That preserves the existing Suspense layout while ensuring one `requestBoundary.component` call. `cache()` is more implicit and easier to misuse across callers; a shared promise is direct and local.

### Q5. Should `getUsageSummary()` continue creating `usage_metrics` rows?

Answer: no. A read summary should not mutate the database. Quota/meter mutation paths should continue to ensure rows before updating counters. Displaying a user with no current-month row as zero usage is semantically correct and avoids write churn.

### Q6. Could read-only usage summaries break quota enforcement?

Answer: only if quota checks assume a usage row already exists because a previous read created it. That assumption is exactly the problem. The mutation path must own its own row creation. Tests should explicitly cover absent metrics rows for both read summaries and mutation/reservation paths.

### Q7. Should `UsageMetricsLoadError` disappear?

Answer: not necessarily. It may still be useful for mutation paths after an ensure-and-lock fails unexpectedly. It should not be thrown for normal read summaries with no row. The plan should narrow the error's use rather than deleting it reflexively.

### Q8. Should OAuth state tokens be removed now?

Answer: not in the first implementation slice. The table appears unused in production code, but its comments describe a real multi-instance OAuth state-token design. First classify whether integrations are planned. If the table stays, it needs an active query module and expired-token cleanup. If it is not near-term, remove it in a separate schema cleanup migration with tests/docs updated together.

### Q9. Should resources/task_resources be removed now?

Answer: not without product confirmation. `resources` has a public API and read joins from task detail, but no production writer was found. It may be planned product surface. Treat it as a decision gate: either add a real owner/writer/retention story, or remove/defer the API/schema surface.

### Q10. Should RLS policy shape be changed to avoid nested `users` lookups?

Answer: no for this plan. RLS is a security boundary. The current nested lookup is understandable and indexed through `users.auth_user_id`. Changing policy shape should require `EXPLAIN` evidence and security tests. Benchmark it, document results, and only plan a separate RLS-performance refactor if it is a proven bottleneck.

### Q11. Are new partial indexes worth adding?

Answer: maybe, but only after stats. The job queue query/index mismatch is real, but adding an index before removing less useful ones can increase total cost. The plan should collect query plans and either replace broad indexes with partial composites or defer.

### Q12. Should retention cleanup be implemented as cron, API route, SQL scheduled job, or manual script?

Answer: do not decide generically. Pick by table:

- `job_queue`: if cleanup already exists but is unscheduled, wire the existing helper into an intended maintenance path.
- `stripe_webhook_events`: retention must preserve idempotency for a reasonable replay window.
- `ai_usage_events`: retention may need aggregation first if cost/accounting history is product-relevant.
- `oauth_state_tokens`: expired rows should be removed quickly if the table stays.

### Q13. What would the thermo-nuclear code-quality review reject?

Answer:

- A generic `dbCostOptimizer` abstraction.
- Scattered `if (missingUsageMetrics)` branches across unrelated billing code.
- Optional `dbClient` loosening in RLS-sensitive write paths.
- Large route/component rewrites just to share one data loader.
- Index migrations with no source metrics.
- Table deletion mixed into unrelated billing/page-loader changes.
- Any service-role import in route/app code that bypasses feature-owned write boundaries.

### Q14. What is the code-judo move for this work?

Answer: remove whole categories of incidental work instead of adding more machinery:

- One `/plans` page data promise instead of two server components doing the same auth/snapshot work.
- One usage summary read path that never writes.
- One mutation-owned ensure path for counters.
- One measured index migration instead of ad hoc index-by-index tinkering.
- One retention policy per append-only table instead of hoping storage stays small.

## Implementation Principles

- Keep each slice independently reviewable and revertible.
- Prefer direct data functions in the feature that owns the behavior.
- Keep server-owned mutations behind existing billing/AI/Stripe/service-role boundaries.
- Do not make `dbClient` optional in RLS-sensitive modules that currently require explicit clients.
- Avoid new generic wrappers unless they delete more complexity than they add.
- Do not push any file past 1,000 lines.
- If a file grows substantially, extract a focused helper before continuing.
- Prefer tests that prove the behavior boundary, not tests that assert implementation details.
- Treat Supabase Advisor and `pg_stat_*` findings as claims to validate, not commands to obey blindly.

## Task 0 - Baseline, Source Refresh, and Metrics Snapshot

Purpose: establish evidence before changing code or migrations.

Source verification comment:

- Web search: `Supabase Inspect database debugging monitoring pg_stat_statements unused-indexes index-usage bloat`.
- Review source: `https://supabase.com/docs/guides/database/inspect`
- Sections to check: `Introduction`, `Calls`, `Outliers`, `Index usage`, `Unused indexes`, `Table sizes`, `Index sizes`, `Bloat`.
- Web search: `Supabase Database Advisors unused index duplicate index security performance`.
- Review source: `https://supabase.com/docs/guides/database/database-advisors`
- Sections to check: overview of Security Advisor, Performance Advisor, and index-related lints.
- Web search: `Supabase query optimization pg_stat_statements EXPLAIN analyze`.
- Review source: `https://supabase.com/docs/guides/database/query-optimization`
- Sections to check: `Inspecting query performance`, `pg_stat_statements`, `Examining query plans`, `Indexes`.

Implementation steps:

1. Confirm clean worktree or document unrelated changes with `git status --short`.
2. Capture current scripts from `package.json` and use repo-native validation commands.
3. Run code-only baseline before changes:
   - `pnpm check:type`
   - Targeted tests for billing usage:
     - `pnpm exec vitest run --project integration tests/integration/stripe/usage.spec.ts`
     - `pnpm exec vitest run --project integration tests/integration/db/usage.spec.ts`
   - Targeted tests for request-boundary/page behavior if an existing relevant spec exists.
4. If a live Supabase database is available, capture a read-only metrics snapshot:
   - Table row estimates and sizes for all public tables.
   - Index sizes for all public indexes.
   - `pg_stat_user_indexes` scans, reads, fetches.
   - Top `pg_stat_statements` calls by total time, mean time, rows, and calls.
   - Supabase Advisor output for duplicate/unused indexes and RLS performance warnings.
5. Save the metrics snapshot inside this plan directory as `metrics-before.md` or `metrics-before.sql.md`. Do not commit secrets or connection URLs.

Acceptance criteria:

- The implementer can see which cleanup decisions are code-proven versus metric-proven.
- No destructive migration is planned without a metrics row explaining why.
- Baseline failures, if any, are recorded before implementation starts.

Thermo-nuclear guardrail:

- Do not build a new observability framework. A simple captured SQL/CLI snapshot is enough.

## Task 1 - Consolidate `/plans` Page Data Loading

Purpose: remove duplicated authenticated request-boundary work and duplicated billing snapshot reads from the plans list page.

Source verification comment:

- Web search: `Next.js App Router Server Components Suspense promise data fetching documentation`.
- Review source: `https://nextjs.org/docs/app/building-your-application/data-fetching`
- Sections to check: Server Components data fetching, streaming/Suspense, request memoization guidance.
- Web search: `React cache server components documentation`.
- Review source: `https://react.dev/reference/react/cache`
- Sections to check: memoized functions, server rendering caveats. Use this only to verify whether not using `cache()` remains the simpler choice.

Current evidence:

- `src/app/(app)/plans/page.tsx` renders `PlanCountBadgeContent` and `PlansContent` in separate Suspense boundaries.
- `PlanCountBadgeContent` calls `requestBoundary.component` and `getBillingAccountSnapshot`.
- `PlansContent` calls `requestBoundary.component`, `listPlansPageSummaries`, and `getBillingAccountSnapshot`.

Recommended design:

- Add a small plans-page loader owned by the plans page/component module, for example:
  - `loadPlansPageData(): Promise<PlansPageData | null>`
  - Internally calls `requestBoundary.component` once.
  - Inside the boundary, runs `listPlansPageSummaries` and `getBillingAccountSnapshot` in `Promise.all` using the same `actor` and `db`.
- In `page.tsx`, create one promise:
  - `const data = loadPlansPageData();`
- Pass the same promise to:
  - a badge async component that awaits it and renders `PlanCountBadge`.
  - the list async component that awaits it and renders empty/list content.
- Keep the redirect behavior in one place. If `data` resolves to `null`, the content path redirects to sign-in. The badge path can return null.
- Avoid `React.cache()` unless a shared promise cannot preserve the desired Suspense behavior.

Implementation steps:

1. Introduce a local `PlansPageData` type with only the fields needed by the page.
2. Move the single request-boundary call into one local loader.
3. Update `PlanCountBadgeContent` and `PlansContent` to accept the shared promise instead of starting their own boundary work.
4. Keep the existing user-facing UI and empty/list behavior unchanged.
5. Do not move billing logic into `src/app`; the loader composes feature-owned read functions only.
6. Add or adjust tests only if the repo already has a practical server-component/page test seam. If not, rely on targeted billing tests plus smoke coverage for `/plans`.

Acceptance criteria:

- One `/plans` render path starts one authenticated request boundary for the page data.
- `getBillingAccountSnapshot` is called once per page data promise.
- The header badge and list can still stream independently from static shell where practical.
- No new global cache or generic loader abstraction exists.

Suggested validation:

- `pnpm check:type`
- `pnpm test:unit:changed`
- If practical: a focused unit test with mocked loader calls proving one shared promise is used.
- Existing smoke path that visits `/plans`, if local services are available.

Thermo-nuclear guardrail:

- This is a local orchestration cleanup. Do not create a reusable request-boundary composition framework. The best solution should make the page simpler, not introduce a new concept every route must understand.

## Task 2 - Make Billing Usage Summary Reads Read-Only

Purpose: remove write churn from billing/account snapshot reads while preserving quota enforcement on mutation paths.

Source verification comment:

- Web search: `Supabase pricing database size includes indexes writes free plan`.
- Review source: `https://supabase.com/docs/guides/platform/database-size`
- Sections to check: how database size is calculated and how indexes/materialized views affect storage.
- Web search: `Supabase query optimization indexes write performance`.
- Review source: `https://supabase.com/docs/guides/database/query-optimization`
- Sections to check: index tradeoffs and query inspection guidance.

Current evidence:

- `getUsageSummaryForTier` calls private `getOrCreateUsageMetrics`.
- `getOrCreateUsageMetrics` first performs `serviceRoleDb.insert(...).onConflictDoNothing(...).returning()`.
- `getBillingAccountSnapshot` calls `getUsageSummaryForTier`, so snapshot reads can attempt a write.
- `tests/integration/stripe/usage.spec.ts` currently has a test asserting that `getUsageSummary` creates a metrics row. That test should change because the desired behavior changes.

Recommended design:

- Split read behavior from mutation behavior.
- Add a private `selectUsageMetricsForMonth(userId, month, dbClient)` that returns a row or `null`.
- Add a pure default:
  - `emptyUsageMetricsForMonth(userId, month)` or a narrower counter object with zero counters.
- Update `getUsageSummaryForTier` to:
  - validate tier.
  - select the current-month metrics row through the passed `dbClient`.
  - use zero counters when absent.
  - still compute active plan count from `learningPlans`.
- Keep `ensureUsageMetricsExist`, `incrementUsage`, and reservation-related mutation paths responsible for creating rows.
- Narrow `UsageMetricsLoadError` to mutation paths where an ensure/lock/update should have produced a row.

Implementation steps:

1. Replace `getOrCreateUsageMetrics` usage in `getUsageSummaryForTier` with read-only selection.
2. Keep `incrementUsage` behavior unchanged from a caller perspective: absent row should still be created and incremented.
3. Update tests:
   - Replace `creates usage metrics row for current month if not exists` with `returns zero counters without creating a usage metrics row`.
   - Add/keep a mutation test proving `incrementUsage` still creates the row.
   - Add coverage for `getUsageSummaryForTier` so it remains tier-short-circuited and read-only.
4. Verify `api/v1/user/subscription` still returns zero usage when no metrics row exists.
5. Search for callers that depended on summary reads creating rows:
   - `rg -n "getUsageSummary|getUsageSummaryForTier|usageMetrics" src tests`

Acceptance criteria:

- A user with no current-month usage row gets zero usage in account snapshots.
- Calling `getUsageSummary` or `getUsageSummaryForTier` does not insert a `usage_metrics` row.
- Calling `incrementUsage` still creates/increments a row.
- No route imports `serviceRoleDb` to compensate for this change.

Suggested validation:

- `pnpm exec vitest run --project integration tests/integration/stripe/usage.spec.ts`
- `pnpm exec vitest run --project integration tests/integration/api/user-subscription.spec.ts`
- `pnpm check:type`

Thermo-nuclear guardrail:

- Do not add conditionals across billing consumers. The invariant belongs in one place: summary reads default absent counters to zero; mutation paths ensure rows.

## Task 3 - Remove Duplicate Usage Row Ensure in Metered Reservations

Purpose: make quota reservation transactions do one row ensure, one lock/read, and one increment.

Source verification comment:

- Web search: `PostgreSQL SELECT FOR UPDATE transaction row lock documentation`.
- Review source: `https://www.postgresql.org/docs/current/explicit-locking.html`
- Sections to check: row-level locks, `SELECT FOR UPDATE`, transaction behavior.
- Web search: `PostgreSQL INSERT ON CONFLICT documentation`.
- Review source: `https://www.postgresql.org/docs/current/sql-insert.html`
- Sections to check: `ON CONFLICT`, concurrency behavior.

Current evidence:

- `lockUsageMetricsForMonth` calls `ensureUsageMetricsExist`, then selects the row `FOR UPDATE`.
- `reserveMeteredUsage` calls `config.incrementInTx`.
- `config.incrementInTx` delegates to `incrementUsageInTx`.
- `incrementUsageInTx` calls `ensureUsageMetricsExist` again before updating.

Recommended design:

- Keep the public `incrementUsageInTx` safe for standalone callers.
- Add an internal helper for already-locked rows, for example:
  - `incrementExistingUsageInTx(tx, userId, month, type)`
  - It only performs the update and does not ensure.
- Export it only if needed by `metered-reservation.ts`; otherwise colocate carefully to avoid a public footgun.
- In `reserveMeteredUsage`, after `lockUsageMetricsForMonth`, call the no-ensure increment helper.

Implementation steps:

1. Introduce a narrowly named helper that makes the precondition obvious.
2. Update `METER_CONFIG` or reservation code so the reservation path uses the already-ensured helper.
3. Keep `incrementUsageInTx` behavior unchanged for generation finalization paths that call it independently.
4. Add tests around reservation with absent metrics row:
   - reservation creates one row and increments once.
   - denied reservation does not increment.
   - compensation still decrements correctly.
5. If counting duplicate insert attempts is hard in integration tests, add a small unit-level test around injected transaction/deps only if it does not require a fake ORM maze. Prefer behavior tests over brittle call-count tests.

Acceptance criteria:

- Reservation still works for users with no current-month metrics row.
- Reservation path no longer has two explicit ensure calls in the same transaction.
- No new optional flags like `skipEnsure?: boolean`; use a named helper with a clear precondition instead.

Suggested validation:

- `pnpm exec vitest run --project unit tests/unit/features/billing/regeneration-quota-boundary.spec.ts`
- `pnpm exec vitest run --project unit tests/unit/features/billing/lesson-generation-quota-boundary.spec.ts`
- `pnpm exec vitest run --project integration tests/integration/db/usage.spec.ts`
- `pnpm check:type`

Thermo-nuclear guardrail:

- Do not solve this with boolean modes. A `skipEnsure` flag would be exactly the kind of branching smell this plan is trying to avoid.

## Task 4 - Build a Measured Index Cleanup Package

Purpose: reduce index storage and write amplification without breaking query performance or FK/delete behavior.

Source verification comment:

- Web search: `Supabase Database Advisor duplicate indexes unused indexes`.
- Review source: `https://supabase.com/docs/guides/database/database-advisors`
- Sections to check: index advisor/lints for unused and duplicate indexes.
- Web search: `Supabase inspect unused indexes index sizes index usage`.
- Review source: `https://supabase.com/docs/guides/database/inspect`
- Sections to check: `Unused indexes`, `Index usage`, `Index sizes`, `Table sizes`.
- Web search: `PostgreSQL multicolumn indexes leftmost prefix`.
- Review source: `https://www.postgresql.org/docs/current/indexes-multicolumn.html`
- Sections to check: multicolumn index scan rules and leftmost/equality constraints.
- Web search: `Drizzle ORM indexes PostgreSQL unique index docs`.
- Review source: `https://orm.drizzle.team/docs/indexes-constraints`
- Sections to check: indexes, unique constraints, generated SQL for PostgreSQL.

Static candidates:

- Exact duplicate candidates:
  - `idx_modules_plan_id_order` duplicates unique `modules_plan_id_order_unique`.
  - `idx_tasks_module_id_order` duplicates unique `tasks_module_id_order_unique`.
- Likely left-prefix candidates requiring stats:
  - `idx_modules_plan_id`, likely covered by `(plan_id, order)`.
  - `idx_tasks_module_id`, likely covered by `(module_id, order)`.
  - `idx_task_resources_task_id`, likely covered by unique `(task_id, resource_id)`.
  - `idx_usage_metrics_user_id`, likely covered by unique `(user_id, month)`.
  - `idx_ai_usage_user_id`, likely covered by `(user_id, created_at)` if user-only lookups are not active.
- Low-confidence candidates requiring product/query review:
  - `idx_usage_metrics_month`
  - `idx_ai_usage_created_at`
  - `idx_plan_schedules_inputs_hash`

Implementation steps:

1. Create `metrics-before.md` with one table per candidate:
   - index name
   - table
   - definition
   - size
   - `idx_scan`
   - `idx_tup_read`
   - `idx_tup_fetch`
   - matching queries/callers
   - keep/drop recommendation
2. For each candidate, classify:
   - `drop_exact_duplicate`
   - `drop_if_live_unused`
   - `keep_fk_support`
   - `keep_query_support`
   - `defer_needs_more_data`
3. Verify FK support:
   - child-table FK columns still have an index or left-prefix composite if parent deletes/cascades can touch many rows.
4. Generate a focused schema/migration change only for approved candidates.
5. Prefer one migration for exact duplicates, and a separate migration for riskier candidates.
6. For live production, decide whether concurrent DDL is needed. If using `DROP INDEX CONCURRENTLY` or `CREATE INDEX CONCURRENTLY`, verify the migration runner does not wrap those statements in a transaction.
7. After migration, run `supabase db reset` locally if local services are available, then rerun relevant integration/security tests.

Acceptance criteria:

- Every dropped index has a metrics row and source/query rationale.
- No dropped index is only justified by "looks redundant".
- No migration mixes index cleanup with billing/page-loader behavior changes.
- Schema files and migration files agree.

Suggested validation:

- `pnpm db:generate` if changing Drizzle schema.
- `pnpm db:dev:reset` if local Supabase is available.
- `pnpm test:security`
- `pnpm test:integration:changed`
- `pnpm check:type`
- `pnpm check:lint`

Thermo-nuclear guardrail:

- Do not whack indexes in a broad cleanup commit. The migration must read like a measured replacement of specific database structures, not a speculative purge.

## Task 5 - Align Job Queue Indexes with Real Queue Queries

Purpose: make queue polling and active-regeneration dedupe use indexes that match their predicates and ordering, while removing less useful broad indexes where evidence supports it.

Source verification comment:

- Web search: `PostgreSQL partial indexes documentation`.
- Review source: `https://www.postgresql.org/docs/current/indexes-partial.html`
- Sections to check: partial index predicates, when planner can use partial indexes.
- Web search: `PostgreSQL indexes order by desc multicolumn`.
- Review source: `https://www.postgresql.org/docs/current/indexes-ordering.html`
- Sections to check: index ordering and backward scans.
- Web search: `PostgreSQL EXPLAIN ANALYZE documentation`.
- Review source: `https://www.postgresql.org/docs/current/using-explain.html`
- Sections to check: `EXPLAIN`, `EXPLAIN ANALYZE`, costs, rows, sort nodes.

Current evidence:

- `claimNextPendingJob` filters `status = 'pending'`, `job_type IN (...)`, `scheduled_for <= now()`, orders by `priority desc, created_at`, and uses `FOR UPDATE SKIP LOCKED`.
- Current queue index is `(status, scheduled_for, priority)`, which omits `job_type` and `created_at`, and does not directly match descending priority order.
- Active regeneration lookup filters `plan_id`, `user_id`, `job_type = plan_regeneration`, and pending/processing status, then orders by `created_at desc`.
- Current schema has separate `user_id`, `plan_id`, and `created_at` indexes.

Implementation steps:

1. Capture `EXPLAIN (ANALYZE, BUFFERS)` for representative local/seeded queue queries where possible:
   - pending poll with one job type.
   - pending poll with multiple job types.
   - active regeneration lookup.
2. Compare current plan against candidate indexes:
   - pending partial index such as `(job_type, scheduled_for, priority DESC, created_at)` where `status = 'pending'`.
   - active-regeneration partial index such as `(plan_id, user_id, created_at DESC)` where `job_type = 'plan_regeneration'` and status is pending/processing.
3. Decide whether candidate indexes replace:
   - `idx_job_queue_status_scheduled_priority`
   - `idx_job_queue_plan_id`
   - `idx_job_queue_user_id`
   - `idx_job_queue_created_at`
4. Add or alter schema indexes only after query-plan evidence.
5. Add tests only for behavior if query code changes. Do not add tests that assert planner internals.

Acceptance criteria:

- Queue claim behavior is unchanged.
- Dedupe behavior is unchanged.
- Index changes are backed by query plans and stats.
- Broad indexes are not kept "just in case" if measured replacement indexes cover their real workload.

Suggested validation:

- `pnpm exec vitest run --project integration tests/integration/db/jobs.queries.spec.ts`
- `pnpm exec vitest run --project integration tests/integration/monitoring-queries.test.ts`
- `pnpm test:security`
- `pnpm check:type`

Thermo-nuclear guardrail:

- Avoid adding new indexes on top of every old index. The goal is fewer better-aligned structures, not a larger index set.

## Task 6 - Evaluate Plan List and Duplicate-Plan Query Indexes

Purpose: decide whether plan reads need a better ordering index and whether duplicate detection needs a normalized lookup strategy.

Source verification comment:

- Web search: `PostgreSQL expression indexes lower text docs`.
- Review source: `https://www.postgresql.org/docs/current/indexes-expressional.html`
- Sections to check: expression indexes and update cost.
- Web search: `PostgreSQL multicolumn indexes order by where user_id created_at`.
- Review source: `https://www.postgresql.org/docs/current/indexes-multicolumn.html`
- Sections to check: equality columns plus range/order columns.
- Web search: `Supabase query optimization EXPLAIN indexes`.
- Review source: `https://supabase.com/docs/guides/database/query-optimization`
- Sections to check: examining query plans and indexes.

Current evidence:

- `fetchUserPlanListRows` filters by `user_id`, orders by `created_at desc`, and paginates.
- Existing `learning_plans` indexes support `user_id`, `(user_id, generation_status)`, `(user_id, origin)`, and `(user_id, is_quota_eligible, generation_status)`.
- `findRecentDuplicatePlan` filters `user_id`, `lower(topic)`, recent `created_at`, and generation status, with no expression index.

Implementation steps:

1. Measure plan list query with realistic user row counts.
2. If sort cost appears in the plan or row counts justify it, consider `(user_id, created_at DESC)`.
3. Review whether existing `(user_id, origin)` and `(user_id, generation_status)` are used by real code or only historical.
4. For duplicate detection, do not add a `lower(topic)` expression index by default. First ask whether a normalized topic/hash field would be a better model if duplicate detection becomes important.
5. If duplicate detection remains a 60-second guard over small per-user row counts, keep it simple and defer.

Acceptance criteria:

- Any new plan-list index replaces or justifies existing indexes rather than piling on.
- Duplicate detection is not over-indexed without evidence.
- No schema change is made solely because a query "could" use an index.

Suggested validation:

- Targeted plan read tests if query code changes.
- `pnpm test:integration:changed`
- `pnpm check:type`

Thermo-nuclear guardrail:

- Do not solve a tiny duplicate-detection window with a permanent index unless the measured plan says this is a real cost.

## Task 7 - Classify Unused or Planned Tables Before Removal

Purpose: decide whether `oauth_state_tokens`, `resources`, and `task_resources` are active product surfaces, planned surfaces, or removable schema.

Source verification comment:

- Web search: `Supabase Row Level Security policies authenticated exposed schemas`.
- Review source: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Sections to check: enabling RLS, policies, service role behavior, exposed schemas.
- Web search: `OAuth state parameter CSRF best practices state token storage`.
- Review source: `https://datatracker.ietf.org/doc/html/rfc6749`
- Sections to check: authorization request `state` parameter and CSRF guidance. Use this only if keeping OAuth state-token storage.
- Web search: `Supabase database size indexes table storage free plan`.
- Review source: `https://supabase.com/docs/guides/platform/database-size`
- Sections to check: storage calculation and free-plan implications.

Current evidence:

- `oauth_state_tokens` exists with comments for short-lived OAuth proof/state rows, but current `src` search found no production reads/writes.
- `resources` has an API list route and read joins through `task_resources`, but current `src` search found no production writer.
- Security tests cover RLS around these tables, so removal requires test updates.

Implementation steps:

1. Run a fresh active-surface scan:
   - `rg -n "oauthStateTokens|oauth_state_tokens|stateTokenHash|state_token_hash" src tests docs supabase`
   - `rg -n "insert\\(resources\\)|from\\(resources\\)|taskResources|task_resources" src tests docs supabase`
2. Classify each table:
   - `active_product_surface`
   - `planned_near_term`
   - `infrastructure_needed_but_missing_query_module`
   - `remove_or_defer`
3. If `oauth_state_tokens` stays:
   - add/verify a query module that performs atomic consume/delete.
   - add expired-token cleanup.
   - keep RLS and tests.
4. If `resources` stays:
   - identify the production writer or create a clear product follow-up.
   - decide whether the API should remain exposed before writer exists.
   - verify indexes match actual list/join usage.
5. If either surface is removed:
   - remove schema, migrations, relations, API route/docs/tests together.
   - do not leave docs claiming the table exists.

Acceptance criteria:

- No "maybe future" table remains without an owner and retention/usage story.
- No table removal happens inside the same PR as billing read cleanup.
- RLS/security tests reflect the chosen schema.

Suggested validation:

- `pnpm test:security`
- Resource API integration tests if API stays.
- `pnpm check:type`
- `pnpm check:lint`

Thermo-nuclear guardrail:

- Do not keep dead schema because removing it is annoying. Also do not delete planned product data just because no writer exists yet. Force the classification decision.

## Task 8 - Add Retention Policies for Append-Only and TTL Tables

Purpose: prevent silent storage growth from audit/idempotency/queue tables.

Source verification comment:

- Web search: `Supabase Cron pg_cron scheduled jobs documentation`.
- Review source: `https://supabase.com/docs/guides/cron`
- Sections to check: creating cron jobs, SQL execution, operational constraints.
- Web search: `Supabase Edge Functions schedule cron database cleanup documentation`.
- Review source: `https://supabase.com/docs/guides/functions/schedule-functions`
- Sections to check: scheduled functions and when to prefer app-owned jobs.
- Web search: `Stripe webhook event retry idempotency duplicate events documentation`.
- Review source: `https://docs.stripe.com/webhooks`
- Sections to check: event delivery behavior, retries, duplicate handling, idempotency considerations.

Current evidence:

- `ai_usage_events` is append-only usage/audit data.
- `stripe_webhook_events` records idempotency by event ID.
- `oauth_state_tokens` has `expires_at` but no production cleanup path found.
- `cleanupOldJobs` exists but current search found no production caller.

Implementation steps:

1. Define retention needs per table:
   - `job_queue`: completed/failed/cancelled rows older than configured age.
   - `oauth_state_tokens`: expired rows if table stays.
   - `stripe_webhook_events`: preserve enough history to avoid replay duplicate processing; do not choose a short window blindly.
   - `ai_usage_events`: decide whether raw events are product-visible/accounting-critical before deleting; consider monthly aggregation first if needed.
2. Prefer existing helper reuse:
   - if `cleanupOldJobs` is correct, schedule/call it rather than writing a parallel cleanup path.
3. Keep cleanup operations service-role/admin-owned.
4. Add tests for deletion predicates:
   - deletes old eligible rows.
   - keeps active/unexpired/recent rows.
   - does not delete rows needed for idempotency inside retention window.
5. Document the retention window in code comments near the cleanup policy and in database docs.

Acceptance criteria:

- Every append-only/TTL table has an explicit keep/delete decision.
- Cleanup paths are not triggered by user read requests.
- No retention task deletes data needed for billing, support, or security audit without a documented decision.

Suggested validation:

- Existing monitoring/job cleanup specs.
- Stripe webhook reconciliation tests.
- Usage/audit integration tests.
- `pnpm test:integration:changed`
- `pnpm check:type`

Thermo-nuclear guardrail:

- Do not create a generic cleanup scheduler abstraction if one or two explicit jobs are enough. Retention policy should be boring and auditable.

## Task 9 - Benchmark RLS Policy Cost Without Changing the Boundary

Purpose: verify whether RLS policy predicates are a real performance bottleneck before considering any policy rewrite.

Source verification comment:

- Web search: `Supabase RLS performance best practices indexes auth functions`.
- Review source: `https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv`
- Sections to check: benchmarks, wrapping functions, indexing policy columns, minimizing joins.
- Web search: `Supabase Row Level Security service_role bypass RLS docs`.
- Review source: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Sections to check: policy behavior, service role behavior, auth helper behavior.

Current evidence:

- `recordOwnedByCurrentUser` and `planOwnedByCurrentUser` use nested `users` lookups through the current JWT subject.
- Task/resource policies use nested `EXISTS` across tasks/modules/plans.
- The app often includes explicit user filters in query code, which helps.

Implementation steps:

1. Pick representative RLS queries:
   - plan list summaries.
   - plan detail/module/task joins.
   - task progress reads/writes.
   - resource joins if resources stay.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` under an authenticated RLS client where practical.
3. Compare with service-role/admin plan only as diagnostic context, not as replacement behavior.
4. Confirm indexes on policy columns:
   - `users.auth_user_id`
   - plan/task/module FK columns.
5. If RLS policy cost is acceptable, document and stop.
6. If cost is high, open a separate plan for policy refactor. Potential direction: use a request/session variable for internal user UUID, but only after security design review.

Acceptance criteria:

- This task produces evidence, not a policy rewrite.
- Security tests remain unchanged unless a later explicit RLS refactor is approved.
- No service-role reads replace authenticated RLS reads for user-owned data.

Suggested validation:

- `pnpm test:security`
- RLS-focused integration tests.

Thermo-nuclear guardrail:

- Do not trade security clarity for speculative speed. RLS policy simplification is a separate project if evidence supports it.

## Task 10 - Add Guardrails Against Service-Role Boundary Drift

Purpose: ensure DB cleanup does not accidentally reintroduce server-owned write privilege leaks or service-role imports in request-layer code.

Source verification comment:

- Web search: `Supabase service_role key bypasses RLS never expose docs`.
- Review source: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Sections to check: service role behavior and client exposure warnings.
- Web search: `Oxlint no restricted imports configuration`.
- Review source: `https://oxc.rs/docs/guide/usage/linter/config.html`
- Sections to check: rule overrides and import restrictions if supported by current Oxlint version.

Current evidence:

- `supabase/AGENTS.md` says service-role imports should not appear in API routes.
- `.oxlintrc.json` currently does not show an import-boundary rule enforcing that.
- Recent repo lessons emphasize server-owned writes through feature-owned service-role boundaries.

Implementation steps:

1. Search for direct service-role imports:
   - `rg -n "@supabase/service-role|serviceRoleDb|from './service-role'|from '../service-role'" src supabase tests`
2. Classify allowed imports:
   - trusted feature-owned write boundaries.
   - Supabase helper modules.
   - tests/fixtures.
3. If Oxlint supports a clean import restriction, add it.
4. If Oxlint cannot express this clearly, add a small script/test that fails on disallowed imports.
5. Keep the rule narrow. Do not block trusted boundary modules that already own server-side writes.

Acceptance criteria:

- Request routes and app components cannot directly import service-role DB helpers.
- Guardrail is documented and covered by lint/test.
- No broad lint churn or unrelated formatting changes.

Suggested validation:

- `pnpm check:lint`
- `pnpm check:type`
- `pnpm test:security`

Thermo-nuclear guardrail:

- Avoid a giant custom lint framework. A narrow static check is enough if Oxlint cannot do it cleanly.

## Task 11 - Documentation and Cleanup Notes

Purpose: keep docs aligned so future agents do not restore removed write-on-read or dead-table behavior.

Source verification comment:

- Web search: `Supabase database size indexes storage docs`.
- Review source: `https://supabase.com/docs/guides/platform/database-size`
- Sections to check: database size and storage implications.
- Web search: `Supabase performance advisors docs`.
- Review source: `https://supabase.com/docs/guides/database/database-advisors`
- Sections to check: performance advisor and index lints.

Implementation steps:

1. Update `docs/database/schema-overview.md` if indexes/tables change.
2. Update `supabase/AGENTS.md` if service-role guardrails or table ownership changes.
3. Update feature docs only where behavior changes:
   - billing usage reads no longer create rows.
   - retention policy windows.
   - removed/deferred tables.
4. If a change reveals a durable lesson, update `.agents/plans/lessons.md` after implementation.

Acceptance criteria:

- Docs match live schema and code.
- No stale instruction tells agents that read paths create usage metrics rows.
- No stale schema overview lists removed indexes/tables.

Suggested validation:

- `pnpm check:lint`
- Link/path spot checks for touched docs.

Thermo-nuclear guardrail:

- Do not turn docs into a duplicate implementation spec. Capture ownership, invariants, and operational commands only.

## Task 12 - Final Validation and Review Package

Purpose: prove the implementation is correct and easy to review.

Source verification comment:

- Web search: `Supabase local development CLI db reset docs`.
- Review source: `https://supabase.com/docs/guides/local-development/cli/getting-started`
- Sections to check: local start/reset/migrations flow.
- Web search: `Drizzle Kit generate migrations docs`.
- Review source: `https://orm.drizzle.team/docs/drizzle-kit-generate`
- Sections to check: migration generation and schema sources.

Implementation steps:

1. Run targeted tests for each changed slice immediately after that slice.
2. After all slices:
   - `pnpm test:changed`
   - `pnpm check:full`
3. If schema/migrations changed and local Supabase is available:
   - `pnpm db:dev:start`
   - `pnpm db:dev:reset`
   - relevant integration/security tests.
4. Inspect for tool churn:
   - `git status --short`
   - `git diff --check`
   - `git diff -- supabase/config.toml`
5. If index/table migrations were added, include:
   - before/after metrics.
   - rollback notes.
   - why each index/table was dropped/kept.

Acceptance criteria:

- No failing changed tests.
- Full lint/type baseline passes.
- Security/RLS tests pass if schema, privileges, service-role boundaries, or policies changed.
- Review summary separates behavior cleanup, schema cleanup, and docs/test changes.

Thermo-nuclear guardrail:

- If the final diff mixes too many concerns, split the work before review. Page-loader cleanup, billing read/write cleanup, index migrations, table removal, retention jobs, and guardrails can be separate commits or PRs.

## Recommended Implementation Order

1. Task 0: baseline and metrics snapshot.
2. Task 1: `/plans` page shared data promise.
3. Task 2: read-only usage summaries.
4. Task 3: single ensure in metered reservation.
5. Task 10: service-role import guardrail if the first three tasks touch trusted boundaries.
6. Task 4: measured exact-duplicate index cleanup.
7. Task 5: job queue index replacement if metrics prove it.
8. Task 6: plan-list/duplicate-plan index decision if metrics prove it.
9. Task 7: table ownership decision.
10. Task 8: retention policy implementation.
11. Task 9: RLS benchmark-only report.
12. Task 11 and Task 12: docs and final validation.

## Explicit Defer List

- RLS policy rewrite to use internal user UUID session settings.
- Global request-boundary/data-loader framework.
- Removing resources or OAuth tables without product classification.
- Adding expression indexes for duplicate topic detection without measured need.
- Adding new queue indexes while leaving all existing queue indexes in place.
- Any migration against hosted production without a stats snapshot and rollback plan.

## Done Definition

This cleanup is complete when:

- `/plans` no longer duplicates request-boundary/billing snapshot work.
- Billing usage summaries are read-only and absent metrics rows display as zero.
- Metered reservations do not double-ensure the same usage row.
- Index cleanup decisions are backed by live stats and captured in this plan package.
- Append-only/TTL tables have explicit retention or deferral decisions.
- Unused/planned tables have owner/remove decisions.
- Service-role boundary guardrails are enforced or explicitly deferred with rationale.
- `pnpm test:changed` and `pnpm check:full` pass.
