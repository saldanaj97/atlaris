# Technical Debt

## Reserved `plan_generation` job type

`plan_generation` remains in the shared job-type map and database enum, but no
worker currently processes it. Initial plan generation still runs
synchronously in the streaming route, so the enum value is effectively
reserved for a future queue-backed initial-generation flow.

This is deferred because deleting the enum value now would add migration churn
without simplifying any active runtime path. Revisit it if initial generation
moves onto workers, or if the team decides to shrink the job enum surface.

## Thin queue wrapper in `src/features/jobs/queue.ts`

`src/features/jobs/queue.ts` mostly delegates one-for-one into
`src/lib/db/queries/jobs.ts`. That duplication is intentional today because it
keeps service-role binding in one place and avoids leaking service-role DB
imports throughout worker and route code.

This should only be refactored if a richer queue domain layer emerges. Until
then, the wrapper stays as a narrow composition boundary.

## Remaining `generationStatus = 'generating'` write in attempt reservation

This cleanup removed duplicate `ready`, `failed`, and `pending_retry` writes
from attempt finalization so plan-success and plan-failure transitions are
owned by lifecycle helpers. One direct `generationStatus = 'generating'` write
still lives in `src/lib/db/queries/attempts.ts` during attempt reservation.

That write is deferred because `lib/` is not allowed to import from
`features/`, so moving it into `plan-operations.ts` would violate the current
dependency direction. Revisit this when plan-state mutation helpers are moved
to a shared lower-level module or the attempt reservation flow is reshaped.

## RLS JWT claim re-application inside attempt transactions

Attempt reservation and finalization re-read and re-apply
`request.jwt.claims` inside transactions. This is a deliberate workaround for
transaction-scoped claim drift observed in some environments.

The workaround should stay until the DB/runtime layer guarantees stable claims
through nested transaction scopes. Removing it prematurely risks subtle
cross-tenant authorization failures.

## Missing DB-level task title hardening

`src/lib/db/schema/tables/tasks.ts` still relies on application validation for
task title constraints. There is no DB-level length constraint yet.

This is deferred because it requires a schema migration and careful rollout for
existing rows. Revisit it when hardening content limits or touching the tasks
schema for related work.

## Missing OpenRouter cost-tracking columns

`src/lib/db/schema/tables/usage.ts` still notes follow-up work for richer
OpenRouter cost accounting fields. Current usage tracking is sufficient for the
product’s active limits, but not for finer-grained provider cost analysis.

This should be revisited when cost dashboards, reconciliation, or model-level
billing audits become a product requirement.

## Drizzle snapshot metadata drift

`src/lib/db/migrations/meta` currently has a broken generator snapshot chain:
`0010_snapshot.json` and `0011_snapshot.json` share the same `id` and
`prevId`, and snapshots for later journal entries are missing.

`drizzle-kit generate` currently fails on that collision, so Phase 3’s schema
change was added as a manual SQL migration plus `_journal.json` entry instead
of an auto-generated snapshot set. Revisit this before the next schema change
so future migrations can be generated normally again.

## Enum naming mismatch: `youtube` vs `video`

`src/lib/db/enums.ts` still carries a TODO around the `youtube` resource enum
name. Renaming it back to `video` would improve conceptual consistency, but it
would also require a migration plus compatibility work for any persisted rows
and UI logic.

This remains deferred until a broader resource-taxonomy cleanup is scheduled.

## `users` table column-level UPDATE grant

Migration `0018_harden_users_update_columns.sql` restricts the `authenticated`
role to only UPDATE `name`, `preferred_ai_model`, and `updated_at` on the
`users` table. All other columns (billing, system-managed) are only writable by
the service-role which has BYPASSRLS.

When adding new user-editable columns to the `users` table, the column-level
GRANT must be updated in **four locations**:

1. A new migration SQL file extending the GRANT list
2. `tests/helpers/db.ts` — `ensureRlsRolesAndPermissions()`
3. `tests/setup/testcontainers.ts` — `grantRlsPermissions()`
4. `.github/workflows/ci-trunk.yml` — both E2E and Integration grant blocks

Failure to update these will cause the new column to be unwritable by
authenticated users (caught by existing RLS tests failing).
