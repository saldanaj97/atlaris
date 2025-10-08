Here’s a focused plan to implement Step 3 (Database Schema Updates) with DB tests only, aligned with the current Drizzle schema and testing setup.

**Scope**

- Add subscription enums and Stripe fields to `users`.
- Add `usage_metrics` table with constraints and indexes.
- Create migrations and DB-only tests (no unit/integration beyond schema).
- Keep changes consistent with existing Drizzle + RLS patterns.

**Schema Changes**

- `src/lib/db/enums.ts`
  - Add `subscription_tier` enum: `free | starter | pro`.
  - Add `subscription_status` enum: `active | canceled | past_due | trialing`.
- `src/lib/db/schema.ts`
  - `users`
    - Change `subscriptionTier` from `text` to `subscription_tier` enum. Default `free`. Consider `NOT NULL` with default to keep reads simple.
    - Add `stripeCustomerId: text` (unique, nullable).
    - Add `stripeSubscriptionId: text` (unique, nullable).
    - Add `subscriptionStatus: subscription_status` (nullable; no default).
    - Add `subscriptionPeriodEnd: timestamp with time zone` (nullable).
  - `usage_metrics` (new)
    - Columns: `id uuid pk default gen_random_uuid()`, `userId uuid fk -> users.id on delete cascade`, `month text (YYYY-MM)`, `plansGenerated int default 0 check >= 0`, `regenerationsUsed int default 0 check >= 0`, `exportsUsed int default 0 check >= 0`, `createdAt timestamptz default now()`, `updatedAt timestamptz default now()`.
    - Constraints: `unique(userId, month)`.
    - Indexes: `idx_usage_metrics_user_id` on `userId`, `idx_usage_metrics_month` on `month`.
    - RLS: enable RLS and add minimal policies consistent with existing tables:
      - Owner read/write; service_role full; no anon writes. (Security tests can be added later; business-logic DB tests bypass RLS by design.)

**Migrations**

- Generate migration: `pnpm db:generate`.
- Adjust migration for safe enum conversion:
  - Create enum types.
  - Safely convert `users.subscription_tier` from `text` → `subscription_tier`:
    - Add temp enum column with default `'free'` and `NOT NULL`.
    - Backfill from old `subscription_tier` when value IN (`free`, `starter`, `pro`), else keep `'free'`.
    - Drop old column; rename temp → `subscription_tier`.
  - Add new `users` columns:
    - `stripe_customer_id text unique null`
    - `stripe_subscription_id text unique null`
    - `subscription_status subscription_status null`
    - `subscription_period_end timestamptz null`
  - Create `usage_metrics` with constraints, indexes, and RLS enabled + policies following repository patterns.
- Apply migrations (when ready): `pnpm db:push` (use a test DB URL as per docs/testing/testing.md).

**DB Tests**

- Location: `tests/db/stripe.schema.spec.ts`
- Setup: Uses existing `vitest` setup (`tests/setup.ts`) which truncates and bypasses RLS using direct `postgres-js` superuser connection.
- Tests for `users`
  - Default tier: `ensureUser()` yields `subscriptionTier = 'free'`.
  - Enum enforcement: update user `subscriptionTier` to `'starter'` and `'pro'` succeeds; attempt `'gold'` throws DB error.
  - Stripe IDs uniqueness: set `stripeCustomerId`/`stripeSubscriptionId` on user A; attempt setting the same on user B fails with unique violation.
  - Subscription status enum: setting to `'trialing'`, `'past_due'`, `'active'`, `'canceled'` succeeds.
  - `subscriptionPeriodEnd`: can store and read a valid timestamp.
- Tests for `usage_metrics`
  - Insert OK with defaults; counters default to 0 and satisfy non-negative checks.
  - Unique `(userId, month)`: second insert with same pair fails with unique violation.
  - Non-negative checks: inserting negative `plansGenerated`/`regenerationsUsed`/`exportsUsed` fails.
  - FK cascade: insert metrics then delete user and verify metrics are removed.
  - Index presence: assert `pg_indexes` contains entries for `usage_metrics` on `user_id` and `month` (verify by name pattern on `pg_indexes` for `usage_metrics`).
- Optional (nice-to-have, not required by spec): format validation on `month` (`YYYY-MM`) via a CHECK constraint; if added, test invalid format fails.

**Docs and Hygiene**

- Update `docs/testing/testing.md`:
  - Add a short “DB schema tests” note and reference `tests/db/stripe.schema.spec.ts`.
  - Remind to apply migrations to test DB before running tests (`drizzle-kit push` with test `DATABASE_URL`).
- Run checks:
  - `pnpm lint`, `pnpm type-check`.
  - Format with `pnpm format` if needed.

**Proposed File Touches**

- src/lib/db/enums.ts: add `subscription_tier`, `subscription_status`.
- src/lib/db/schema.ts: update `users`; add `usage_metrics` + RLS policies.
- src/lib/db/migrations/<new>.sql: generated and refined DDL.
- tests/db/stripe.schema.spec.ts: new DB tests.
- docs/testing/testing.md: add brief entry for schema tests.

**Assumptions**

- `subscription_tier` default should be `free` and `NOT NULL` (consistent, minimizes null handling).
- `subscription_status` nullable until subscription exists.
- Using existing test DB strategy (superuser bypassing RLS) is acceptable for these DB tests.
- We’ll mirror existing RLS policy style for `usage_metrics`, but not add RLS tests now.

Notes:

- Test setup in `tests/setup.ts` already truncates tables and closes the DB client after all tests.
- These tests use direct Postgres connection; RLS is bypassed by design for business-logic tests.
