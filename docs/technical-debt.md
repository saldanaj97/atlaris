# Technical Debt

## ~~Reserved `plan_generation` job type~~ *(resolved)*

Resolved by removing the `plan_generation` value from the job-type enum, the
TypeScript constant map, and all associated dead types (`PlanGenerationJobData`,
`PlanGenerationJobResult`, `PlanGenerationJobPayload`). A migration drops the
enum value from PostgreSQL.

## Thin queue wrapper in `src/features/jobs/queue.ts`

`src/features/jobs/queue.ts` mostly delegates one-for-one into
`src/lib/db/queries/jobs.ts`. That duplication is intentional today because it
keeps service-role binding in one place and avoids leaking service-role DB
imports throughout worker and route code.

This should only be refactored if a richer queue domain layer emerges. Until
then, the wrapper stays as a narrow composition boundary.

## ~~Remaining `generationStatus = 'generating'` write in attempt reservation~~ *(resolved)*

Resolved by extracting `setLearningPlanGenerating()` and
`PLAN_GENERATING_INSERT_DEFAULTS` into
`src/lib/db/queries/helpers/plan-generation-status.ts`. Both
`reserveAttemptSlot` (UPDATE on retry) and `atomicCheckAndInsertPlan` (INSERT
on creation) now use the shared helper/constant, eliminating the inline drift
risk while preserving the `lib/ → features/` dependency direction.

Success/failure transitions (`markPlanGenerationSuccess`,
`markPlanGenerationFailure`) remain in `plan-operations.ts` by design — they
touch billing-adjacent fields (`isQuotaEligible`, `finalizedAt`) and belong
in the plans feature domain.

## RLS JWT claim re-application inside attempt transactions

Attempt reservation and finalization re-read and re-apply
`request.jwt.claims` inside transactions (transaction-local `set_config`).

Integration coverage in
[`tests/integration/db/rls-claim-transaction-stability.spec.ts`](../tests/integration/db/rls-claim-transaction-stability.spec.ts)
shows that session-scoped `request.jwt.claims` (set with `set_config(..., false)` in
`createAuthenticatedRlsClient`) **remains visible** inside `dbClient.transaction()`,
including with `pg_advisory_xact_lock`, RLS `SELECT`s, and nested transactions
(savepoints), **for Testcontainers Postgres** used in CI/local integration runs.

Neon serverless or other poolers are not covered by that test; keep the
re-apply pattern until production behavior is verified or explicitly safe.

**Follow-up:** Run the same claim-visibility scenarios against the live Neon dev
branch (a one-off script connecting with `DATABASE_URL_UNPOOLED`, setting
`SET ROLE authenticated` + `set_config('request.jwt.claims', ..., false)`, then
reading claims inside `dbClient.transaction()` without re-applying). If all
pass, remove the ceremony (`prepareRlsTransactionContext` /
`reapplyJwtClaimsInTransaction` at call sites). If any fail, mark this item as
"confirmed required on Neon" and close permanently. Blocked on Neon compute
quota as of 2026-03-24.

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

**Explicit deferral (OpenRouter migration slice, #296 / plan audit):** Do not add
`estimated_cost_cents` or `model_pricing_snapshot` on `ai_usage_events`, or
provider-returned cost provenance, until the accounting contract is defined end
to end (canonical usage, metadata, persistence). `cost_cents` continues to hold
the app-estimated value from `computeCostCents`.

Persistable vs runtime-only models (e.g. excluding `openrouter/free` from saved
prefs) and tier-aware listing are implemented in
[`src/features/ai/model-preferences.ts`](../src/features/ai/model-preferences.ts),
`GET`/`PATCH` [`/api/v1/user/preferences`](../src/app/api/v1/user/preferences/route.ts),
and plan stream model resolution in
[`plans/stream/route.ts`](../src/app/api/v1/plans/stream/route.ts). Further API
contract changes for other consumers remain deferred until needed.

## ~~Drizzle snapshot metadata drift~~ *(resolved)*

Resolved by fixing the `0010`/`0011` snapshot ID collision, adding a no-op
`0019_snapshot_realignment.sql` migration that carries a valid current-state
snapshot, and removing the orphaned `0001_enable_force_rls.sql` file.
`drizzle-kit generate` now works normally; migration `0020_burly_jackal.sql`
was the first auto-generated migration since the fix.

## ~~Enum naming mismatch: `youtube` vs `video`~~ *(resolved)*

Resolved: the `resource_type` enum value was renamed from `youtube` to `video`
via `ALTER TYPE ... RENAME VALUE` migration, and all code references updated.

~~`src/lib/db/enums.ts` still carries a TODO around the `youtube` resource enum
name. Renaming it back to `video` would improve conceptual consistency, but it
would also require a migration plus compatibility work for any persisted rows
and UI logic.~~

~~This remains deferred until a broader resource-taxonomy cleanup is scheduled.~~

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
