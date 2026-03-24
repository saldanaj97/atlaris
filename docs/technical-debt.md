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

## ~~Missing DB-level task title hardening~~ *(resolved)*

Resolved in migration `0020_burly_jackal.sql`. CHECK constraints
(`char_length(title) <= 500`) now exist on `modules`, `tasks`, and `resources`
tables. The AI parser also truncates titles defensively before DB insertion.
Constants live in `src/lib/db/schema/constants.ts`; drift is caught by
`tests/unit/db/title-length-constraints.spec.ts`.

## Missing OpenRouter cost-tracking columns

`src/lib/db/schema/tables/usage.ts` still notes follow-up work for richer
OpenRouter cost accounting fields. Current usage tracking is sufficient for the
product’s active limits, but not for finer-grained provider cost analysis.

This should be revisited when cost dashboards, reconciliation, or model-level
billing audits become a product requirement.

## ~~Drizzle snapshot metadata drift~~ *(resolved)*

Resolved by fixing the `0010`/`0011` snapshot ID collision, adding a no-op
`0019_snapshot_realignment.sql` migration that carries a valid current-state
snapshot, and removing the orphaned `0001_enable_force_rls.sql` file.
`drizzle-kit generate` now works normally; migration `0020_burly_jackal.sql`
was the first auto-generated migration since the fix.

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

**Canonical column list:** [`src/lib/db/privileges/users-authenticated-update-columns.ts`](../src/lib/db/privileges/users-authenticated-update-columns.ts) (`USERS_AUTHENTICATED_UPDATE_COLUMNS`). Every other copy must match this module and the migration.

When adding new user-editable columns to the `users` table, update in lockstep:

1. **Migration** — new or amended SQL (e.g. extend `GRANT UPDATE (...)` in the migration chain).
2. **Canonical TS** — `users-authenticated-update-columns.ts` (source of truth for tests and bootstrap).
3. [`tests/helpers/db/rls-bootstrap.ts`](../tests/helpers/db/rls-bootstrap.ts) — `ensureRlsRolesAndPermissions()` (integration helpers that mirror grants after `db:migrate`).
4. [`tests/setup/testcontainers.ts`](../tests/setup/testcontainers.ts) — `grantRlsPermissions()` (ephemeral Postgres for integration/e2e/security).
5. [`.github/workflows/ci-trunk.yml`](../.github/workflows/ci-trunk.yml) — E2E and Integration job grant blocks.

Unit tests in `tests/unit/db/users-authenticated-update-columns.spec.ts` compare the migration, `ci-trunk.yml`, and bootstrap sources against the canonical list.

**CI PR note:** The fast integration job in `.github/workflows/ci-pr.yml` prepares the DB with `pnpm db:push` and broad table grants; it does **not** replicate the full migration `0018` column-level `REVOKE`/`GRANT` sequence. Do not assume PR integration DBs match production privilege layout; full alignment is enforced on trunk (`ci-trunk.yml`) and via migrations + the files above.

Failure to update consumers after changing the allowlist will cause authenticated users to lose `UPDATE` on new columns or leave billing columns writable — caught by security/unit tests and the drift spec.
