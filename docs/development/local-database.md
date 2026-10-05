# Local Supabase for development

Use the **Supabase CLI native local stack** for local development. It runs Postgres directly on your machine (no Docker), keeps local database behavior close to hosted Supabase, preserves Drizzle ORM for typed application access, and keeps Supabase SQL migrations as the deployable database history. Idle memory is about 339 MB versus about 2.3 GB for the OrbStack stack (see the [spike evidence](./supabase-native-spike.md#resource-numbers)).

Clerk Auth remains hosted. The local stack replaces the database only: Studio is disabled (it needs the REST API, which Atlaris does not run). Use `pnpm exec drizzle-kit studio` or a desktop Postgres client instead.

## Database environments

| Environment                    | Database                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Local developer                | Native Supabase stack, one per worktree (`pnpm db start`)                                             |
| Cloud agents (Codex, Cursor Cloud) | Native Supabase stack on the agent VM via `pnpm db agent`                                         |
| Local automated tests          | Native named `test` stack with `--native-db` / `ATLARIS_TEST_DB=native`; Testcontainers PostgreSQL 17 when unset |
| CircleCI DB-backed tests       | Docker executor PostgreSQL 17 secondary container (unchanged)                                         |
| Staging                        | Hosted Supabase `atlaris-dev`, for integration and manual smoke checks only                           |
| Production                     | Hosted Supabase `atlaris-prod`                                                                        |

No automated test lane uses the long-lived dev stack or a hosted Supabase/staging/production database.

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the native stack. This also writes `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING` into this worktree's `.env.local`:

   ```bash
   pnpm db start
   ```

3. Reset the local DB from migrations and seed:

   ```bash
   pnpm db reset
   ```

4. Start the app:

   ```bash
   pnpm dev
   ```

### Ports and per-worktree `.env.local`

The CLI assigns each stack a free port in 20000–32767 and reports it in `supabase status --output-format json` as `env.DB_URL`. Nothing is fixed, so two worktrees can run stacks side by side.

`pnpm db start` (on either runtime) and `pnpm db agent up` write that URL into the worktree's `.env.local` as `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`, preserving every other line. They refuse non-local hosts, and a symlinked `.env.local` (worktree bootstrap) is replaced by a copy so the main checkout's file is never modified.

### Stack identity and branch switches

A stack is identified by directory + git branch + stack name. Switching branches inside a worktree switches to a different stack with a different database. Run `pnpm db start` and `pnpm db reset` after switching.

### pg_cron

pg_cron cannot reach the socket-only native Postgres unless it runs as a background worker ([supabase/cli#6977](https://github.com/supabase/cli/issues/6977)), and `db reset` reverts that setting. `pnpm db start`, `pnpm db reset`, `pnpm db agent up`, and `pnpm db agent reset` apply `cron.use_background_workers = on` automatically (restarting the stack when it changes). Run these wrappers instead of calling `supabase start` or `supabase db reset` directly.

### One-time destroy for old stacks

A stack saved before ports became dynamic fails with `endpoints.sql.port cannot change`. The wrapper prints the fix. It deletes that stack's local data, and `pnpm db start` recreates it:

```bash
pnpm exec supabase stack destroy --yes
```

### Docker fallback

If the native runtime does not work on your machine, run the Docker (OrbStack) stack instead:

```bash
pnpm db start --runtime docker
```

This needs OrbStack or Docker Desktop running. It also writes `.env.local`, but pg_cron's background-worker workaround is native-only. Keep OrbStack's memory in mind (about 2.3 GB idle). Stop it with `pnpm db stop`.

## Cloud agent database

Codex and Cursor Cloud agents run `pnpm db agent up` before database work. It starts the same native stack on the agent VM, applies migrations and the seed, and writes `.env.local` with the loopback URL. The native path was verified on Linux arm64 (Debian 12, glibc 2.36) as a non-root user.

- The first start downloads about 483 MB from GitHub, so the VM needs outbound access to github.com.
- As root, set `SUPABASE_NATIVE_POSTGRES_USER` to an existing non-root OS user; the native runtime will not run Postgres as root.
- The legacy PostgreSQL 17 path (fixed `127.0.0.1:55432`, role and database `atlaris_agent`, installed by `scripts/agents/install-postgres-17.sh`) stays available with `ATLARIS_AGENT_DB=postgres`. There is no automatic fallback between the two.
- Hosted database or Supabase credentials are never used or accepted, and the commands take no URL or target arguments.

| Command                   | Behavior                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `pnpm db agent preflight` | Read-only host, toolchain, and credential-boundary checks                     |
| `pnpm db agent up`        | Idempotently starts the stack, applies migrations, seeds, and verifies state  |
| `pnpm db agent status`    | Read-only readiness report                                                    |
| `pnpm db agent reset`     | Resets only the managed local database and reprovisions it                    |

Diagnose with `pnpm db agent status`; do not add a hosted URL to make it pass. Vercel Preview cannot reach a database inside an agent VM.

## Automated test databases

Local automated tests (integration, RLS/security, workflow, e2e, smoke) default to Testcontainers PostgreSQL 17, which needs Docker. To run without Docker, use the native test stack:

```bash
pnpm test integration --native-db   # or: ATLARIS_TEST_DB=native pnpm test integration
```

This starts or resumes a named `test` stack for the current worktree (separate from the dev stack, so dev data is never touched), points the tests at it, and keeps it running afterward. Stop it with `pnpm exec supabase stop --stack test`; remove its data with `pnpm exec supabase stack destroy --stack test --yes`. Details and the Supabase-image differences the bootstrap handles: [tests/AGENTS.md](../../tests/AGENTS.md#test-database-testcontainers-default-or-native-supabase-stack).

Measured on 2026-10-05 with Docker stopped: integration 88 files / 521 tests in 39 s, security 51 tests in 18 s, workflow 11 tests in 24 s.

CircleCI is unchanged. `ci-pr` / `ci-trunk` database-backed jobs attach a `postgres:17-alpine` secondary container on the Docker executor and set `SKIP_TESTCONTAINERS=true` with:

```env
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
POSTGRES_URL_NON_POOLING=postgresql://postgres:postgres@127.0.0.1:5432/postgres
```

With `SKIP_TESTCONTAINERS=true`, no container is started. The global setup waits for Postgres, runs the shared bootstrap, `pnpm db migrate`, RLS grants, runtime fixups, and template-database creation, then writes process-scoped runtime state (`TESTCONTAINERS_ENV_FILE`). Each Vitest worker clones `atlaris_test_wN` from that template. It requires `POSTGRES_URL` and/or `POSTGRES_URL_NON_POOLING` and refuses non-local hosts. Do not point tests at hosted databases.

## Local product testing

`supabase db reset` applies committed migrations and then runs `supabase/seed.sql`, which inserts the deterministic local product-testing user. Set:

```env
LOCAL_PRODUCT_TESTING=true
DEV_AUTH_USER_ID=00000000-0000-4000-8000-000000000001
```

That value matches `localProductTestingEnv.seed.authUserId` in `@/lib/config/env`. Use `pnpm db seed` only when you need to re-run the seed without resetting the database.

## Manual smoke checklist

1. `pnpm db start`
2. `pnpm db reset`
3. Confirm `.env.local` has the `POSTGRES_URL` that `pnpm db start` wrote (check with `pnpm exec supabase status`).
4. Set local product-testing flags as needed: `LOCAL_PRODUCT_TESTING=true`, `DEV_AUTH_USER_ID` = seed auth id.
5. `pnpm dev` — open protected routes such as dashboard; header should show authenticated nav for the seeded user.
6. Billing fixtures: run `pnpm db fixture --user-id <users.auth_user_id> --plan pro` to update local subscription state through the Clerk Billing projection path.
   Run it after a local DB reset/reseed or when changing the test plan/status; the fixture persists in the local `users` row and does not need to run before every `pnpm dev`.
7. AI: use the mock provider for local-safe plan-generation flows.
8. Real Clerk sessions, real third-party OAuth, and hosted payment processing remain staging/production concerns. For fixture vs real Clerk development checkout env contracts and the opt-in payment verification checklist, see [Clerk development checkout](./environment.md#clerk-development-checkout-fixture-vs-real-payment-flow).

## Clean slate

```bash
pnpm db reset
```

`supabase db reset` recreates the local database from `supabase/migrations` and then applies `supabase/seed.sql`.

## Migration ownership

Drizzle schema/types remain in the repo for typed ORM access, but committed migration files under `supabase/migrations` are the deployable source of truth.

Use Supabase CLI migration commands for new schema changes:

```bash
supabase migration new <descriptive_name>
supabase db diff -f <descriptive_name>
supabase db reset
```

## Scripts

| Script                      | Command                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| Start Supabase (native)     | `pnpm db start`                                                           |
| Start Docker fallback       | `pnpm db start --runtime docker`                                          |
| Stop Supabase               | `pnpm db stop`                                                            |
| Reset DB + seed             | `pnpm db reset`                                                           |
| Re-run seed only            | `pnpm db seed`                                                            |
| Apply Clerk Billing fixture | `pnpm db fixture --user-id <users.auth_user_id> --plan pro`              |

`pnpm db seed` refuses non-localhost database hosts so it cannot accidentally write to hosted databases.

## Hosted Supabase migrations

Hosted migrations are applied from GitHub Actions by `scripts/db/run-phased-migrations.sh`: exhaustive `EXPAND_MIGRATIONS` / `CONTRACT_MIGRATIONS` manifests, a phase-specific temporary workspace of applied history plus that phase's pending files, and `supabase migration up --linked --include-all --yes`. Contract refuses to run while expand migrations are still pending (see `docs/ci-cd/pipeline-and-deployment-strategy.md`).

Hosted deployment and migration workflows are separate from the local-dev stack. Do not point local reset/seed commands at hosted databases.

## Troubleshooting

- **Supabase CLI not found** — Run `pnpm install`; the project keeps `supabase` as a dev dependency.
- **`endpoints.sql.port cannot change`** — The stack predates dynamic ports. Run `pnpm exec supabase stack destroy --yes`, then `pnpm db start`.
- **Connection refused** — Run `pnpm db start`; the URL in `.env.local` is the stack's current `env.DB_URL` (`pnpm exec supabase status --output-format json`). Start again after switching branches.
- **Wrong or empty database after switching branches** — Each branch has its own stack. Run `pnpm db start` and `pnpm db reset`.
- **Missing seed user** — Run `pnpm db seed` or `pnpm db reset`.
- **pg_cron jobs fail with `job startup timeout`** — You likely ran `supabase db reset` directly. Use `pnpm db reset`, which re-applies the background-worker setting.
- **Native stack will not start as root** — Set `SUPABASE_NATIVE_POSTGRES_USER` to a non-root OS user (cloud agents).
- **Tests should not use the dev stack or hosted databases** — Use `--native-db` (named `test` stack) or leave Testcontainers on. Do not use hosted URLs.
