# DB Free-Plan Cost Cleanup Todos

## Phase 0 - Evidence

- [x] Confirm worktree scope with `git status --short`.
- [x] Refresh task-specific docs using the web-search comments in `plan.md`.
- [x] Run baseline `pnpm check:type`.
- [x] Run baseline billing usage specs.
- [x] Capture live Supabase metrics if credentials are available.
- [x] Write `metrics-before.md` in this directory if any index/table migration is planned.

## Phase 1 - Code-Proven Waste

- [x] Consolidate `/plans` page data loading to one shared page-data promise.
- [ ] Verify `/plans` still renders the count badge, empty state, list state, and sign-in redirect correctly.
- [x] Make `getUsageSummaryForTier` read-only for absent current-month usage rows.
- [x] Update usage summary tests to expect zero counters without row creation.
- [x] Keep `incrementUsage` and reservation mutation paths row-creating.
- [x] Remove duplicate usage-row ensure from metered reservation transaction.
- [x] Validate billing and quota tests.

## Phase 2 - Guardrails

- [x] Search and classify all direct service-role imports.
- [ ] Add a narrow lint/static test guard if current tooling can enforce the boundary cleanly.
- [ ] Run `pnpm check:lint`.
- [ ] Run `pnpm test:security` if service-role or RLS guardrails changed.

## Phase 3 - Measured Index Work

- [ ] Build the candidate index table in `metrics-before.md`.
- [ ] Decide exact duplicate drops.
- [ ] Decide left-prefix drops only with live usage evidence.
- [ ] Decide queue replacement indexes only with `EXPLAIN` evidence.
- [ ] Decide plan-list index only with measured sort/scan evidence.
- [ ] Generate schema/migration changes in a focused migration.
- [ ] Validate local reset/security/integration tests if local Supabase is available.

## Phase 4 - Table and Retention Decisions

- [ ] Classify `oauth_state_tokens`.
- [ ] Classify `resources` and `task_resources`.
- [ ] Decide `ai_usage_events` retention or aggregation requirement.
- [ ] Decide `stripe_webhook_events` retention window.
- [ ] Wire or defer `job_queue` cleanup scheduling.
- [ ] Add tests for any retention predicates implemented.

## Phase 5 - Docs and Final Validation

- [ ] Update `docs/database/schema-overview.md` for schema/index/table changes.
- [ ] Update `supabase/AGENTS.md` for ownership/guardrail changes if needed.
- [ ] Update `.agents/plans/lessons.md` only after a real implementation lesson is learned.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.
- [x] Run `git diff --check`.
- [x] Inspect `git diff -- supabase/config.toml` for tool churn.
- [ ] Prepare review notes with before/after evidence and rollback notes for migrations.
