# Local Supabase for development

Use the **Supabase CLI local stack** for long-lived local development. This keeps local database behavior closer to hosted Supabase than a standalone Postgres service while preserving Drizzle ORM and committed SQL migrations.

Clerk Auth remains hosted. Supabase local replaces the database and local Supabase services only.

## Local product testing

`supabase db reset` applies committed migrations and then runs `supabase/seed.sql`, which inserts the deterministic local product-testing user. Set:

```env
LOCAL_PRODUCT_TESTING=true
DEV_AUTH_USER_ID=00000000-0000-4000-8000-000000000001
```

That value matches `localProductTestingEnv.seed.authUserId` in `@/lib/config/env`. Use `pnpm db:dev:seed` only when you need to re-run the seed without resetting the database.

## Manual smoke checklist

1. `pnpm db:dev:start`
2. `pnpm db:dev:reset`
3. Copy local Supabase URL and keys from `supabase status` into `.env.local`.
4. Set local product-testing flags as needed: `LOCAL_PRODUCT_TESTING=true`, `DEV_AUTH_USER_ID` = seed auth id, optional `STRIPE_LOCAL_MODE=true`.
5. `pnpm dev` — open protected routes such as dashboard; header should show authenticated nav for the seeded user.
6. Pricing / checkout: with `STRIPE_LOCAL_MODE`, complete checkout redirects through `/api/v1/stripe/local/complete-checkout` and subscription state updates via webhook processor.
7. AI: use the mock provider for local-safe plan-generation flows.
8. Real Clerk sessions, real third-party OAuth, and hosted Stripe remain staging/production concerns; see [environment.md](./environment.md).

## Ports and local services

| Port   | Service                      | Purpose                         |
| ------ | ---------------------------- | ------------------------------- |
| 54321  | Supabase API                 | Local Data/Auth API URL         |
| 54322  | Supabase Postgres            | Local development database      |
| 54323  | Supabase Studio              | Local database UI               |
| 54324  | Supabase email testing inbox | Local auth email monitor        |
| 54330  | `docker-compose.test.yml`    | Manual / CI-style tests         |
| random | Testcontainers PostgreSQL 17 | Automated integration/RLS tests |

Automated integration/security tests still use isolated Testcontainers, not the long-lived Supabase local database.

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start Supabase local:

   ```bash
   pnpm db:dev:start
   ```

3. Reset the local DB from migrations and seed:

   ```bash
   pnpm db:dev:reset
   ```

4. Configure local app env from `supabase status`:

   ```env
   POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key from supabase status>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
   ```

   If a command needs `POSTGRES_URL_NON_POOLING`, set it to the same local `POSTGRES_URL`.

5. Start the app:

   ```bash
   pnpm dev
   ```

## Clean slate

```bash
pnpm db:dev:reset
```

`supabase db reset` recreates the local database from `supabase/migrations` and then applies `supabase/seed.sql`.

## Drizzle and migration ownership

Drizzle schema/types remain in the repo, but committed migration files live under `supabase/migrations`.

`drizzle.config.ts` prefers direct connection URLs for DDL:

`POSTGRES_URL_NON_POOLING` -> `POSTGRES_URL`.

For local Supabase, `POSTGRES_URL` alone is enough unless you are running a command that explicitly requires the non-pooling alias.

## Scripts

| Script            | Command                 |
| ----------------- | ----------------------- |
| Start Supabase    | `pnpm db:dev:start`     |
| Stop Supabase     | `pnpm db:dev:stop`      |
| Reset DB + seed   | `pnpm db:dev:reset`     |
| Re-run seed only  | `pnpm db:dev:seed`      |
| Legacy seed alias | `pnpm db:dev:bootstrap` |

`pnpm db:dev:seed` refuses non-localhost database hosts so it cannot accidentally write to hosted databases.

## Hosted Supabase migrations

Use a direct/session connection string for DDL when Supabase recommends it. `drizzle.config.ts` falls back from `POSTGRES_URL_NON_POOLING` to `POSTGRES_URL`.

Hosted deployment and migration workflows are separate from the local-dev stack. Do not point local reset/seed commands at hosted databases.

## Troubleshooting

- **Supabase CLI not found** — Run `pnpm install`; the project keeps `supabase` as a dev dependency.
- **Port conflict** — Stop the process using the relevant Supabase local port, or adjust `supabase/config.toml`.
- **Connection refused** — Run `pnpm db:dev:start`; confirm `supabase status` reports Postgres on `127.0.0.1:54322`.
- **Missing seed user** — Run `pnpm db:dev:seed` or `pnpm db:dev:reset`.
- **Integration tests should not use Supabase local** — Leave Testcontainers enabled unless you are intentionally debugging with `SKIP_TESTCONTAINERS=true`.
