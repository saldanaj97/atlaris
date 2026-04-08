# Local PostgreSQL for development

Use a **local Postgres 17** instance when Neon compute quota blocks migrations, when you need **offline** work, or when you want to **dry-run** schema changes (`pnpm db:generate` → `pnpm db:migrate`) before pushing to CI or Neon.

Neon Auth (`NEON_AUTH_*`, cookies) remains **cloud**; a local DB only replaces the **database** connection.

### Local product testing

After `pnpm db:dev:bootstrap`, a deterministic user row exists. Set `LOCAL_PRODUCT_TESTING=true` and `DEV_AUTH_USER_ID=00000000-0000-4000-8000-000000000001` (same as `localProductTestingEnv.seed.authUserId` in `@/lib/config/env`) so server-side local identity matches that row. See [environment.md](./environment.md) and `src/lib/config/local-product-testing.ts` for precedence vs `AI_*`, `AV_*`, and Stripe envs.

### Manual smoke checklist (local product testing)

1. `pnpm db:dev:start` then `pnpm db:dev:bootstrap`.
2. `.env.local`: `LOCAL_PRODUCT_TESTING=true`, `DEV_AUTH_USER_ID` = seed auth id, optional `STRIPE_LOCAL_MODE=true`, `STRIPE_SECRET_KEY` optional when local Stripe mode is on.
3. `pnpm dev` — open protected routes (e.g. dashboard); header should show authenticated nav for the seeded user.
4. Pricing / checkout: with `STRIPE_LOCAL_MODE`, complete checkout redirects through `/api/v1/stripe/local/complete-checkout` and subscription state updates via webhook processor.
5. Integrations: verify the settings page shows Google Calendar as an explicit `Coming Soon` placeholder rather than a live provider flow.
6. AI: set `MOCK_AI_SCENARIO` to exercise failure paths (mock provider).
7. PDF: set `AV_PROVIDER=mock` and `AV_MOCK_SCENARIO` for provider outcomes (heuristic pass still runs first).
8. Real Neon Auth sessions, real third-party OAuth, and hosted Stripe remain staging; see [environment.md](./environment.md) for boundaries.

## Ports and local services

| Port  | Service                   | Database name   | Purpose                          |
| ----- | ------------------------- | --------------- | -------------------------------- |
| 54330 | `docker-compose.test.yml` | `atlaris_test`  | Manual / CI-style test Postgres  |
| 54331 | Homebrew PostgreSQL 17    | `atlaris_dev`   | Long-lived local **dev** DB      |

## Quick start

1. Install and configure PostgreSQL 17 once:

   ```bash
   brew install postgresql@17
   brew services start postgresql@17

   PG17_BIN="$(brew --prefix postgresql@17)/bin"
   "$PG17_BIN"/psql postgres -c "ALTER SYSTEM SET listen_addresses = 'localhost';"
   "$PG17_BIN"/psql postgres -c "ALTER SYSTEM SET port = '54331';"
   brew services restart postgresql@17

   "$PG17_BIN"/psql -p 54331 postgres <<'SQL'
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
       CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';
     ELSE
       ALTER ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';
     END IF;
   END
   $$;

   SELECT 'CREATE DATABASE atlaris_dev OWNER postgres'
   WHERE NOT EXISTS (
     SELECT FROM pg_database WHERE datname = 'atlaris_dev'
   )\gexec
   SQL
   ```

2. Start Postgres for development:

   ```bash
   pnpm db:dev:start
   ```

3. Bootstrap once (extensions, roles, `auth.jwt`, migrations, RLS grants):

   ```bash
   pnpm db:dev:bootstrap
   ```

   Default URL: `postgresql://postgres:postgres@localhost:54331/atlaris_dev`. Override with `DATABASE_URL` if needed.

4. Point the app at local Postgres (same value for all three — see [Drizzle URL order](#drizzle-migration-url-order)):

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:54331/atlaris_dev
   DATABASE_URL_NON_POOLING=postgresql://postgres:postgres@localhost:54331/atlaris_dev
   DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@localhost:54331/atlaris_dev
   ```

5. Run migrations anytime with `pnpm db:migrate` (uses `.env.local` via `drizzle.config.ts`).

### Clean slate

```bash
pnpm db:dev:reset   # drops and recreates atlaris_dev
pnpm db:dev:bootstrap
```

## Drizzle migration URL order

`drizzle.config.ts` prefers direct connections for DDL:

`DATABASE_URL_NON_POOLING` → `DATABASE_URL_UNPOOLED` → `DATABASE_URL`.

For local dev, set all three to the **same** string.

## Scripts

| Script               | Command                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| Start dev DB         | `pnpm db:dev:start`                                                     |
| Stop dev DB          | `pnpm db:dev:stop`                                                      |
| Reset dev DB         | `pnpm db:dev:reset`                                                     |
| First-time bootstrap | `pnpm db:dev:bootstrap`                                                 |

`bootstrap-local-db` refuses non-localhost hosts so it cannot accidentally run against Neon if misconfigured.

## Neon quota vs migration SQL

If `pnpm db:migrate` against Neon fails with **compute-time quota** errors, that is Neon billing/limits, not necessarily bad SQL. Use local Postgres above to apply and test migrations, then retry Neon when quota allows.

## Optional: Neon Local (not the default)

Official **Neon Local** (`neondatabase/neon_local`) still talks to **Neon cloud** and needs API keys; it does **not** replace a fully offline Postgres for migration dry-runs. The default local path is native Postgres on `localhost:54331`.

### Future: serverless proxy

If the app later uses `@neondatabase/serverless` against a local HTTP proxy, that would be a separate change (see `src/lib/db/neon-config.ts`).

## Integration tests and `atlaris_dev`

`tests/helpers/db/truncate.ts` only allows truncating databases whose name matches `/(^|_)(test|tests)$/`. **`atlaris_dev` does not match** — so `truncateAll()` refuses to wipe the dev DB. That is intentional: you should not point integration tests at your long-lived dev database.

If you force integration tests against a non-test database, truncation will fail unless `ALLOW_DB_TRUNCATE=true` (still dangerous).

## Troubleshooting

- **Connection refused** — Run `pnpm db:dev:start` and ensure PostgreSQL 17 is running on port **54331**.
- **Port conflict** — Stop another Postgres on 54331 or update your local PostgreSQL 17 port configuration.
- **`pnpm db:dev:bootstrap` rejects host** — `DATABASE_URL` points at a non-localhost host; use a local URL or unset `DATABASE_URL` to use the default.

---

## Neon (production): migrations when quota allows

This is **operational** and gated on Neon availability; it is independent of Workstream 1 above.

### Pre-flight

1. Confirm the correct **Neon project and branch** in the dashboard — wrong `DATABASE_URL` is the main risk.
2. Apply the migration chain **locally** first (`pnpm db:migrate` against `atlaris_dev`) so you know the SQL applies cleanly.
3. On Neon, inspect the journal:

   ```sql
   SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;
   ```

   Confirm the latest applied tag matches expectations (e.g. `0022` before adding `0023_…`).

### Apply

With `.env.local` pointing at Neon (prefer non-pooling URL for DDL if you provide one):

```bash
pnpm db:migrate
```

### Verify (example: Phase 3 / `ai_usage_events`)

- Journal contains `0023_phase3_ai_usage_provider_cost` **exactly once**.
- Table `ai_usage_events` has nullable `provider_cost_microusd bigint`, nullable `model_pricing_snapshot` jsonb, and CHECK `ai_usage_events_provider_cost_microusd_nonneg`.

### Rollback (only if needed)

Drizzle Kit does **not** roll back migrations automatically. For nullable additive columns, manual SQL is:

```sql
ALTER TABLE ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_provider_cost_microusd_nonneg;
ALTER TABLE ai_usage_events DROP COLUMN IF EXISTS model_pricing_snapshot;
ALTER TABLE ai_usage_events DROP COLUMN IF EXISTS provider_cost_microusd;
DELETE FROM drizzle.__drizzle_migrations WHERE tag = '0023_phase3_ai_usage_provider_cost';
```

Close the GitHub issue only after operational verification matches the product checklist (write paths, partial gating, RLS, etc.).
