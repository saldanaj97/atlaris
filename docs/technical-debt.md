# Technical Debt

## ~~`tests/integration/db/jobs.queue.spec.ts` failure under `pnpm test:changed`~~ _(resolved)_

Previously tracked because `pnpm test:changed` failed in
`tests/integration/db/jobs.queue.spec.ts` with ordering assertions in the job
queue service suite.

Resolved as stale on 2026-05-01: targeted
`pnpm vitest run tests/integration/db/jobs.queue.spec.ts --project integration`
passed 10/10, and `pnpm test:changed` passed.

## ~~Reserved `plan_generation` job type~~ _(resolved)_

Resolved by removing the `plan_generation` value from the job-type enum, the
TypeScript constant map, and all associated dead types (`PlanGenerationJobData`,
`PlanGenerationJobResult`, `PlanGenerationJobPayload`). A migration drops the
enum value from PostgreSQL.

## ~~Thin queue wrapper in `src/features/jobs/queue.ts`~~ _(resolved: intentional boundary)_

`src/features/jobs/queue.ts` mostly delegates one-for-one into
`src/lib/db/queries/jobs.ts`. That duplication is intentional today because it
keeps service-role binding in one place and avoids leaking service-role DB
imports throughout worker and route code.

This should only be refactored if a richer queue domain layer emerges. Until
then, the wrapper stays as a narrow composition boundary.

Closed as not actionable on 2026-05-01. This is a deliberate composition
boundary, not a cleanup target.

## ~~Dead `getCurrentUserRecordSafe()` cleanup in `src/lib/api/auth.ts`~~ _(resolved)_

Resolved by removing `getCurrentUserRecordSafe()` from `src/lib/api/auth.ts`,
deleting its dedicated unit coverage from `tests/unit/api/auth.spec.ts`, and
updating the auth guidance/docs so `withServerComponentContext()` is the only
recommended server-component wrapper for authenticated DB work.

## ~~Remaining `generationStatus = 'generating'` write in attempt reservation~~ _(resolved)_

Resolved by extracting `setLearningPlanGenerating()` and
`PLAN_GENERATING_INSERT_DEFAULTS` into
`src/lib/db/queries/helpers/plan-generation-status.ts`. Both
`reserveAttemptSlot` (UPDATE on retry) and the lifecycle persistence store’s
atomic insert (INSERT on creation) use the shared helper/constant, eliminating
the inline drift risk while preserving the `lib/ → features/` dependency direction.

Success/failure transitions (`markPlanGenerationSuccess`,
`markPlanGenerationFailure`) live in
`src/features/plans/lifecycle/adapters/plan-persistence-store.ts` (adapter-private)
— they touch billing-adjacent fields (`isQuotaEligible`, `finalizedAt`) and
belong in the plans feature domain.

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

## ~~Missing DB-level task title hardening~~ _(resolved)_

Resolved in migration `0020_burly_jackal.sql`. CHECK constraints
(`char_length(title) <= 500`) now exist on `modules`, `tasks`, and `resources`
tables. The AI parser also truncates titles defensively before DB insertion.
Constants live in `src/lib/db/schema/constants.ts`; drift is caught by
`tests/unit/db/title-length-constraints.spec.ts`.

## ~~OpenRouter cost accounting on `ai_usage_events`~~ _(shipped, #301)_

`ai_usage_events` now carries three distinct cost-related fields:

- **`cost_cents`** — App-estimated cost from the local catalog (`computeCostCents`).
  Unchanged meaning; used for limits and product-side accounting.
- **`provider_cost_microusd`** — OpenRouter-reported request cost in integer
  micro-USD (USD × 1e6), nullable when the provider omitted cost or canonical
  usage was partial.
- **`model_pricing_snapshot`** — Versioned (`ModelPricingSnapshotV1`) catalog
  snapshot explaining how `cost_cents` was computed at insert time; `null` when
  provenance would be wrong (partial usage, unknown model, router/alias models
  such as `openrouter/free`).

Normalization, gating, and the shared `CanonicalAIUsage` → `recordUsage` mapper
live in `src/features/ai/usage.ts`, `src/features/ai/model-pricing-snapshot.ts`,
and `src/lib/db/usage.ts`. Generation usage flows through
`UsageRecordingAdapter` / `UsageRecordingPort` (and the lifecycle service), which
use the same mapper.

Persistable vs runtime-only models and tier-aware listing remain in
[`src/features/ai/model-preferences.ts`](../src/features/ai/model-preferences.ts),
`GET`/`PATCH` [`/api/v1/user/preferences`](../src/app/api/v1/user/preferences/route.ts),
and plan stream model resolution in
[`plans/stream/route.ts`](../src/app/api/v1/plans/stream/route.ts).

## ~~Drizzle snapshot metadata drift~~ _(resolved)_

Resolved by fixing the `0010`/`0011` snapshot ID collision, adding a no-op
`0019_snapshot_realignment.sql` migration that carries a valid current-state
snapshot, and removing the orphaned `0001_enable_force_rls.sql` file.
`drizzle-kit generate` now works normally; migration `0020_burly_jackal.sql`
was the first auto-generated migration since the fix.

## ~~Enum naming mismatch: `youtube` vs `video`~~ _(resolved)_

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
4. [`tests/helpers/db/bootstrap.ts`](../tests/helpers/db/bootstrap.ts) — `grantRlsPermissions()` (shared with [`tests/setup/testcontainers.ts`](../tests/setup/testcontainers.ts) for ephemeral Postgres).
5. [`.github/workflows/ci-trunk.yml`](../.github/workflows/ci-trunk.yml) — E2E and Integration job grant blocks.

Unit tests in `tests/unit/db/users-authenticated-update-columns.spec.ts` compare the migration, `ci-trunk.yml`, and bootstrap sources against the canonical list.

**CI PR note:** The fast integration job in `.github/workflows/ci-pr.yml` prepares the DB with `pnpm db:push` and broad table grants; it does **not** replicate the full migration `0018` column-level `REVOKE`/`GRANT` sequence. Do not assume PR integration DBs match production privilege layout; full alignment is enforced on trunk (`ci-trunk.yml`) and via migrations + the files above.

Failure to update consumers after changing the allowlist will cause authenticated users to lose `UPDATE` on new columns or leave billing columns writable — caught by security/unit tests and the drift spec.
