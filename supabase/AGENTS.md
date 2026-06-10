# Supabase Guidelines

**Parent:** [Root AGENTS.md](../AGENTS.md)

This directory owns local Supabase configuration, SQL migrations, and Drizzle schema definitions. Keep this file short; put durable architecture detail in `docs/architecture/` and task notes in `.agents/plans/`.

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
- Use `pnpm db:dev:reset` to rebuild local Supabase from migrations and seed data.

## Retention Cleanup

Retention cleanup is database-owned through `private.cleanup_retained_db_rows()` and the Supabase Cron job `retention-cleanup`.

- The manual HTTP fallback is `POST /api/internal/maintenance/retention/cleanup`.
- Enable the manual route with `RETENTION_CLEANUP_ENABLED=true`.
- Plan cleanup (stuck plans and orphaned attempts) is `POST /api/internal/maintenance/plans/cleanup` with `PLAN_CLEANUP_ENABLED=true`.
- In production, the manual route requires `MAINTENANCE_WORKER_TOKEN`.
- Cron does not use the HTTP route or worker token.
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
