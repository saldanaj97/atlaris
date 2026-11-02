# Supabase Guidelines

**Parent:** [Root AGENTS.md](../AGENTS.md)

This directory owns local Supabase configuration, SQL migrations, and Drizzle schema definitions. Keep this file short; put durable architecture detail in `docs/architecture/`.

## Client Boundaries

- Request handlers, server actions, and server components must use the request-scoped RLS client exposed through `getDb()` from `@supabase/runtime`.
- New request code should enter through `requestBoundary.route`, `requestBoundary.action`, or `requestBoundary.component` from `@/lib/api/request-boundary`; those boundaries set up auth, RLS context, and cleanup.
- Service-role access bypasses RLS. Keep `@supabase/service-role` out of user request paths (`src/app/api/**`, `src/lib/api/**`, `src/lib/integrations/**`) unless the path is explicitly admin/system-owned and reviewed.
- Tests, workers, migrations, and admin maintenance helpers may use service-role when they intentionally need bypass privileges.

## RLS Rules

- Every `pgPolicy(...)` must include an explicit `to`, usually `to: 'authenticated'`.
- Do not omit `to`; PostgreSQL treats omitted policy roles as `PUBLIC`.
- Current product posture has no anonymous app-data policies.
- Query helpers that are RLS-sensitive must require an explicit `dbClient` parameter instead of defaulting to `getDb()`. This makes the caller prove which request or service-role context is being used.
- If an RLS-sensitive flow opens a transaction, use `prepareRlsTransactionContext(dbClient)` before `transaction()` and `reapplyJwtClaimsInTransaction(tx, ctx)` inside the transaction when required.
- Helpers that lock rows, such as `lockOwnedPlanById`, must run on the same explicit `dbClient` as the surrounding transaction.

## Schema Constants

Put DB-related numeric limits, string length caps, and shared constraint values in `supabase/schema/constants.ts`.

- Import constants into table definitions, query helpers, and application validation instead of duplicating magic numbers.
- When adding a constant, document what enforces it: app-layer validation, DB constraint, or both.
- Keep DB CHECK constraints and application sanitization aligned.

## Migrations

- Use committed SQL migrations under `supabase/migrations/`.
- Prefer `pnpm exec supabase migration new <name>` for new migrations.
- Use `pnpm exec supabase db diff -f <name>` only after verifying the local DB state represents the intended schema.
- Use `pnpm db reset` to rebuild local Supabase from migrations and seed data.
- Register every new migration in `scripts/db/run-phased-migrations.sh`: additive changes go in `EXPAND_MIGRATIONS`, destructive or old-binary-breaking changes in `CONTRACT_MIGRATIONS`. `tests/unit/architecture/db-migration-workflows.spec.ts` fails on an unregistered file. Phase rules: `docs/development/deploy.md`.

## Adding a table

Derived from the `openrouter_tier_models` (service-only) and `generation_budget_cuts` (owner select-only) migrations. Pick the access class first; it decides step 5.

1. Define the table in `supabase/schema/tables/<name>.ts` with `.enableRLS()` and an explicit-`to` policy (service-only: a restrictive `<table>_deny_all`, see `openrouter-tier-models.ts`; owner select-only: see `generation-budget-cuts.ts`). Export it from `supabase/schema/index.ts`.
2. Add the migration with RLS enabled, the policy, and the grants/revokes for `anon` and `authenticated` (service-only: `REVOKE ALL ... FROM anon, authenticated`; owner select-only: `GRANT SELECT` plus `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated`).
3. Append an entry to `supabase/migrations/meta/_journal.json` (next `idx`, `tag` = the file name without `.sql`) and update the pinned last entry (`idx`, `tag`) in `tests/unit/architecture/db-migration-workflows.spec.ts`. That test also fails on an unregistered migration file (see Migrations).
4. Register the migration in `scripts/db/run-phased-migrations.sh` (see Migrations).
5. Privileges. `tests/security/effective-privileges-attestation.spec.ts` runs `scripts/db/attest-effective-privileges.sql` against the migrated DB but checks only the tables that script lists, so a missed entry fails silently.
   - **Service-only:** add the table to the three service-only arrays in `scripts/db/attest-effective-privileges.sql` and to the `REVOKE ALL` lines in `tests/helpers/db/bootstrap.ts` and `tests/helpers/db/rls-bootstrap.ts`.
   - **Owner select-only:** add the table to `AUTHENTICATED_SERVER_OWNED_WRITE_TABLES` in `supabase/privileges/authenticated-table-privileges.ts` and to the two arrays in the attestation script that mirror it (the spec asserts they are identical to the constant); the two bootstrap files read the constant. Add the migration file to the concatenated SQL in `tests/unit/helpers/db/server-owned-write-privilege-bootstrap-sync.spec.ts`, which requires each listed table's name in that SQL.
6. Add the table to `TRUNCATE_TABLES` in `tests/helpers/db/truncate.ts`, children before parents. No unit test covers the list; a stale one surfaces as FK errors or deadlocks in integration tests. If tests need rows after each truncate, seed them from `tests/helpers/db/reset.ts`.
7. Add a spec: `tests/integration/db/` for the queries, plus `tests/security/<name>.rls.spec.ts` for owner-scoped tables.
8. Update `docs/database/schema-overview.md`: entity list, the RLS paragraph for the access class, and the index table.

## Retention Cleanup

Retention cleanup is database-owned through `private.cleanup_retained_db_rows()`. The jobs Worker cron (`0 3 * * *`, `workers/jobs/src/jobs/retention-cleanup.ts`, Flagship flag `job-retention-cleanup`) is the only scheduler; the Supabase `pg_cron` job `retention-cleanup` is history.

- The manual HTTP fallback is `POST /api/internal/maintenance/retention/cleanup`.
- Enable the manual route with `RETENTION_CLEANUP_ENABLED=true`.
- Plan cleanup (stuck plans and orphaned attempts) is `POST /api/internal/maintenance/plans/cleanup` with `PLAN_CLEANUP_ENABLED=true`.
- In production, the manual route requires `MAINTENANCE_WORKER_TOKEN`.
- The Worker cron does not use the HTTP route or worker token.
- Cleanup must not run from user read paths.

See `docs/architecture/retention-cleanup-runbook.md` and `docs/architecture/internal-worker-routes.md` for operator detail.

## Anti-Patterns

- Importing `@supabase/service-role` into user request paths.
- Calling `getDb()` outside an auth/request boundary.
- Omitting `to` in `pgPolicy(...)`.
- Forgetting `cleanup()` when manually creating RLS clients.
- Adding local DB limit constants outside `supabase/schema/constants.ts`.
- Defaulting RLS-sensitive query modules to `getDb()` internally.
- Running admin cleanup or queue-wide metrics from tenant-scoped read paths.
