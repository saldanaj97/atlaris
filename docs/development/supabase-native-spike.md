# Supabase native local stack spike (JCS-121)

**Decision: go with blockers.** The native (Docker-free) Supabase runtime runs every Atlaris migration, the seed, the app, and the full integration suite, using about a seventh of OrbStack's memory. Before it can replace OrbStack, three blockers need fixes: pg_cron needs a workaround that `db reset` erases (upstream [supabase/cli#6977](https://github.com/supabase/cli/issues/6977)), the test bootstrap fails on any Supabase Postgres image, and the 1Password Environment shadows a per-worktree `POSTGRES_URL`.

## Status

Follow-up work has landed since this spike:

- F6 and F7 are handled in the test bootstrap ([#677](https://github.com/saldanaj97/atlaris/pull/677), JCS-124).
- B1 (pg_cron) is automated in the `pnpm db` wrappers ([#674](https://github.com/saldanaj97/atlaris/pull/674), [#675](https://github.com/saldanaj97/atlaris/pull/675) for local dev, [#676](https://github.com/saldanaj97/atlaris/pull/676) for cloud agents).
- B3 is resolved: the 1Password variables that shadowed `POSTGRES_URL` were removed.

The sections below record the original evidence. See [local-database.md](./local-database.md) for the current workflow.

Spike date: 2026-10-04. Host: Apple silicon, macOS 27.0.1, Node 24.18, pnpm 11.9, OrbStack 29.4.0 (Docker engine). Branch base: `14e2b6539`. Supabase CLI 2.119.0, native Postgres `17.11.0.002-r0`. Docker image: `public.ecr.aws/supabase/postgres:17.11.0.002`.

None of the spike edits below are committed. A1 owns the real CLI and config changes.

## Results

| # | Check | Result | Key evidence |
| - | ----- | ------ | ------------ |
| 1 | CLI bump to 2.119.0, `[experimental] stack = true`, `supabase start --runtime native` | **Pass**, with two notes | Needs a temporary `minimumReleaseAgeExclude` until 2026-10-07. Studio cannot start while `[api]` is disabled, so the start command adds `--exclude studio`. Cold first start took 18 s, including a ~483 MB artifact download. Warm starts take 3–4 s. |
| 2 | `supabase db reset` on the native stack | **Pass** | All 63 `supabase/migrations/*.sql` files and `seed.sql` applied, in 4 s. Installed and available extensions match Docker. One role and one schema exist only on Docker; neither is used by the repo. |
| 3 | `.env.local` → native stack, `pnpm dev`, seeded user reaches dashboard | **Pass**, with a caveat | `GET /dashboard` returned 200 and rendered the seeded "Dev User" dashboard. Portless was bypassed (see failure F4). The 1Password `POSTGRES_URL` overrides `.env.local` (blocker B3). |
| 4 | RSS/CPU, native vs OrbStack, idle and during `db reset` | **Pass** (measured) | Idle: native 339 MB vs OrbStack 2.3 GB. During reset: native peak 552 MB vs OrbStack peak 2.9 GB. See the [resource numbers](#resource-numbers). |
| 5 | pg_cron workaround, `retention-cleanup` runs | **Pass with workaround** | Without the workaround every run fails with `job startup timeout`. With it, every run succeeds. `db reset` silently drops the workaround, and `[db.settings]` cannot carry it. |
| 6 | Dynamic ports, two worktrees at once, named stack | **Pass** | Ports 21862 and 25864, with separate data. The named stack `test` got port 29291. `db reset --stack` is rejected, but `db reset --db-url "<url>?sslmode=disable"` works. |
| 7 | Test bootstrap (`SKIP_TESTCONTAINERS=true`) against the named stack | **Fail as-is**; **pass with DB-only workarounds** | Two bootstrap failures, both caused by Supabase images rather than the native runtime (F6, F7). With DB-only workarounds, the full integration project passed 88 files / 521 tests in 24 s. |

## What worked: exact changes and commands

### Temporary dependency changes (reverted)

```diff
# package.json
-    "supabase": "^2.115.0",
+    "supabase": "^2.119.0",

# pnpm-workspace.yaml, under minimumReleaseAgeExclude
+  - "supabase@2.119.0"
+  - "@supabase/cli-darwin-arm64@2.119.0"
+  - "@supabase/cli-darwin-x64@2.119.0"
+  - "@supabase/cli-linux-arm64-musl@2.119.0"
+  - "@supabase/cli-linux-arm64@2.119.0"
+  - "@supabase/cli-linux-x64-musl@2.119.0"
+  - "@supabase/cli-linux-x64@2.119.0"
+  - "@supabase/cli-windows-arm64@2.119.0"
+  - "@supabase/cli-windows-x64@2.119.0"
```

`pnpm add -D supabase@2.119.0` without the exclude fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. 2.119.0 was published 2026-09-30T21:36Z, and the repo's 7-day `minimumReleaseAge` (strict) clears it on 2026-10-07. 2.115.0 has no `--runtime`, `--stack`, or `stack` subcommand.

### `supabase/config.toml` diff (final spike state, reverted)

```diff
 [api]
-port = 54321
+# port = 54321  # JCS-121 spike: dynamic port
 [db]
-port = 54322
+# port = 54322  # JCS-121 spike: dynamic port
-shadow_port = 54320
+# shadow_port = 54320  # JCS-121 spike: dynamic port
 [db.pooler]
-port = 54329
+# port = 54329  # JCS-121 spike: dynamic port
 [studio]
-port = 54323
+# port = 54323  # JCS-121 spike: dynamic port
 [inbucket]
-port = 54324
+# port = 54324  # JCS-121 spike: dynamic port
 [edge_runtime]
-inspector_port = 8083
+# inspector_port = 8083  # JCS-121 spike: dynamic port
 [analytics]
-port = 54327
+# port = 54327  # JCS-121 spike: dynamic port
 [experimental]
+stack = true
```

Checks 1–5 ran with only `stack = true` (fixed port 54322). Check 6 onward added the port removals.

### Commands

```bash
# Flags discovered from the CLI. `start --help` shows --stack, --stack-id, --runtime,
# --preparation, and --eager only when the experimental stack is enabled.
pnpm exec supabase start --runtime native --exclude studio      # default stack for this checkout and branch
pnpm exec supabase db reset                                     # default stack only
pnpm exec supabase status --output-format json                  # machine-readable; `-o env` is rejected on stack mode
pnpm exec supabase status --env --output-format text            # KEY='value' lines
pnpm exec supabase status --env --output-format text --override-name DB_URL=POSTGRES_URL
pnpm exec supabase stack list --output-format json
pnpm exec supabase stack restart [--stack <name>]               # reuses the saved composition; does not apply config changes
pnpm exec supabase stop [--stack <name>] | --all
pnpm exec supabase stack destroy [--stack <name>] --yes         # needed when config ports change

# Named instance
pnpm exec supabase start --stack test --runtime native --exclude studio
pnpm exec supabase status --stack test --output-format json
pnpm exec supabase db reset --db-url "postgresql://postgres:postgres@127.0.0.1:<port>/postgres?sslmode=disable" --yes

# pg_cron workaround (repeat after every `db reset`)
psql "postgresql://supabase_admin:postgres@127.0.0.1:<port>/postgres" \
  -c "alter system set cron.use_background_workers = on"
pnpm exec supabase stack restart
```

The host has no `psql` on PATH. The native runtime ships one at `~/.supabase/cache/stack/slim-services/postgres/17.11.0.002-r0/darwin-arm64/bin/psql`.

### Where things live

- Downloaded artifacts: `~/.supabase/cache/stack` (483 MB, shared by all checkouts).
- Per-stack data and state: `~/.supabase/stacks/<id>/`. The id is a stable hash of the identity, so destroying and recreating a stack keeps the same id.
- The default stack starts only Postgres, eagerly. Each stack runs a supervisor and a Postgres supervisor, then Postgres. Native Postgres listens on a per-start Unix socket under `/tmp/supabase-pg-*`, and the CLI proxies `127.0.0.1:<port>` to it.

## Stack identity and per-worktree status shape

Identity is project root + git branch + stack name, as the docs describe. Observed:

| Stack | project_root | branch_context | name | Port |
| ----- | ------------ | -------------- | ---- | ---- |
| Worktree A default | `…/atlaris-jcs-121` | `refs/heads/feature/jcs-121-…` | `default` | 21862 |
| Worktree A named | `…/atlaris-jcs-121` | `refs/heads/feature/jcs-121-…` | `test` | 29291 |
| Worktree B default (detached HEAD) | `…/atlaris-jcs-121-b` | `detached` | `default` | 25864 |

Ports were assigned from 20000–32767 and stayed the same across stop and start. A marker table written in A did not exist in B. Each stack listens only on its own port, and nothing listened on 54322 once fixed ports were removed.

`supabase status --output-format json` shape (values elided):

```text
identity:     { id, name, project_root, branch_context }
runtime:      "native" | "docker" | "podman"
owner:        "reachable" | "unavailable"
lifecycle, readiness            e.g. "running", "ready"
composition:  { members: [ { id, service, activation, state, lifecycle, health } ] }
services:     [ { id, service, state, lifecycle, health, endpoints: { sql: { protocol, address, port, url } } } ]
endpoints:    { "database.sql": { protocol, address, port, url } }
config_drift: { status, message }     e.g. "unchanged"
env:          { DB_URL, PUBLISHABLE_KEY, SECRET_KEY, ANON_KEY, SERVICE_ROLE_KEY }
message
```

With only Postgres enabled, `env` has no `API_URL` or `STUDIO_URL`. A per-worktree `.env.local` writer should read `env.DB_URL` (or `endpoints["database.sql"].port`) and write it to both `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`. The shortcut is `status --env --output-format text --override-name DB_URL=POSTGRES_URL`, which quotes values with single quotes. `supabase start --output-format json` returns `{ id, runtime, endpoints, lazy_services, env, message }`.

## Resource numbers

The scripts sampled `ps -o rss,pcpu` every ~0.5 s. Native totals sum the CLI supervisor processes and every Postgres process. OrbStack totals sum the `OrbStack` and `OrbStack Helper` host processes; the Helper's RSS includes the Linux VM's memory. Postgres backends share memory, so summed RSS overstates native slightly. macOS `pcpu` is a decaying average.

| Scenario | Runtime | Services | Total RSS | CPU | Notes |
| -------- | ------- | -------- | --------- | --- | ----- |
| Idle | Native | Postgres | **339 MB** avg (340 max) | 0.1% avg, 0.4% max | ~190 MB of this is the CLI supervisor on first start (~145 MB on later starts) |
| During `db reset` | Native | Postgres | 361 MB avg, **552 MB peak** | 83.5% peak sample | reset took **4 s** |
| Idle, 3 stacks at once | Native | Postgres ×3 | **838 MB** | 0.4% avg | A default + A `test` (with test DBs) + B default |
| OrbStack running, no containers | OrbStack | — | 1,067 MB | 0.2% avg | baseline before any Supabase container |
| Idle | OrbStack | db + Studio + Kong + pg-meta (current repo config) | **2,331 MB** avg (2,472 max) | 4.7% avg, 27.7% max | `docker stats`: db 59 MB, Studio 200 MB, pg-meta 112 MB, Kong 101 MB |
| During `db reset` | OrbStack | same | 2,444 MB avg, **2,890 MB peak** | 111% peak sample | reset took **13 s**; db container peak 104 MB / 40% |
| Idle | OrbStack | db only (`-x studio,postgres-meta,kong`) | 1,673 MB | 1.4% avg | db container 53.5 MB; the VM does not return all memory after containers stop |

Start times: native cold first start 18 s (artifact download, 63 migrations, seed); native warm start 3–4 s; Docker legacy start 25 s with cached images, 47 s when the Postgres image had to be pulled.

The Docker comparison ran on a temporary `project_id = "atlaris-jcs121-spike"`. The first Docker start restored the existing `supabase_db_atlaris` volume (the main checkout's local data, created 2026-08-27), and resetting it would have destroyed that data. The spike volume was removed afterwards with `supabase stop --no-backup`. `supabase_db_atlaris` was left untouched.

## Native vs Docker database differences

Captured with the same catalog queries as `supabase_admin` against a freshly reset database on each runtime.

| Area | Native | Docker | Matters for Atlaris? |
| ---- | ------ | ------ | -------------------- |
| Installed extensions | pg_cron 1.6.4, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp | identical | — |
| Available extensions | 78 | 78, same names | — |
| `shared_preload_libraries` | pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron, pg_net, pgsodium, auto_explain, pg_tle, plan_filter, supabase_vault | identical | — |
| Roles | all Docker roles except one | adds `supabase_functions_admin` (member of `postgres`) | No: nothing in migrations, tests, or scripts references it |
| Schemas | no `supabase_functions` schema or its default ACLs | `supabase_functions` + default privileges for anon/authenticated/service_role | No: Edge Functions are disabled |
| `postgres` role | non-superuser, BYPASSRLS | same | Yes for tests (F7), but identical on both |
| Memory settings | `shared_buffers` 32 MB, `max_wal_size` 128 MB, `maintenance_work_mem` 32 MB, `jit` off, `bgwriter_delay`/`wal_writer_delay` 2 s, `autovacuum_naptime` 60 s | `shared_buffers` 128 MB, defaults otherwise | No functional effect seen; native is tuned for low memory |
| Network | `listen_addresses` empty; socket in `/tmp/supabase-pg-*`, TCP proxied by the CLI; no TLS | listens on `*` inside the container | Yes for pg_cron (F5) and for `--db-url` (needs `sslmode=disable`) |
| `max_connections` | 100 | 100 | No: four integration workers fit |

## Failures, causes, and upstream links

**F1. Studio refuses to start without the API (check 1).** `ExperimentalStackStartError: Studio cannot be started without the REST API capability`. The repo keeps `[api] enabled = false` and `[studio] enabled = true`, a combination the legacy Docker path allows. The spike used `--exclude studio`. The fix is to choose between `[studio] enabled = false` and enabling `[api]`. No upstream issue was filed.

**F2. Saved stacks pin their ports (check 6).** After the fixed ports were removed, `start` failed with `The requested database endpoints.sql.port cannot change on the saved stack`. Recovering requires `supabase stack destroy --yes`. This is one-time migration friction for every developer.

**F3. `db reset` cannot target a named stack (check 6).** `supabase db reset --stack test` fails with `UnrecognizedOption`, as documented. The workaround is `db reset --db-url "<url>?sslmode=disable" --yes`, which runs a "remote"-style reset: user schemas are dropped, all 63 migrations re-applied, and the seed runs (verified). Without `sslmode=disable` it fails with `tls error (The server does not support SSL connections)`.

**F4. Portless needs a sudo-started proxy (check 3).** `pnpm dev` failed with `Proxy is not running and no TTY is available for sudo`. This has nothing to do with the native runtime. The spike ran the same `op run --environment … -- next dev --webpack --hostname localhost` command that `scripts/dev/start.sh` runs, without Portless, on port 3121. `GET /dashboard` then returned 200 in 8 s and rendered "Welcome back, Local", "Dev User", "Free Plan", and the seeded plans.

**F5. pg_cron jobs never run on native (check 5).** Upstream: [supabase/cli#6977](https://github.com/supabase/cli/issues/6977) (open; reported on Linux as `connection failed`). On macOS, with `retention-cleanup` and a `select 1` probe rescheduled to `* * * * *`, both runs recorded `failed | job startup timeout`. pg_cron's defaults (`cron.host = localhost`, port 5432, `use_background_workers = off`) cannot reach the socket-only native Postgres.
- `ALTER SYSTEM SET cron.use_background_workers = on` as `postgres` fails with `permission denied to set parameter`. As `supabase_admin` (password `postgres`) it works. After `supabase stack restart`, every run succeeds (`succeeded | SELECT 1` for both jobs at 17:08 and 17:09 UTC). The default `max_worker_processes = 8` was enough.
- The setting survives `stop`/`start` and `stack restart`, but **`supabase db reset` reverts it to `off`**.
- `[db.settings] "cron.use_background_workers" = "on"` is **silently dropped**, while `max_worker_processes = 16` in the same table reached Postgres. This matches the upstream report.
- After the spike, `retention-cleanup` was restored to `0 3 * * *` and the probe was unscheduled.

**F6. Test bootstrap: retention migration fails outside the `postgres` database (check 7).** `pnpm db migrate` against `atlaris_test_base` fails at `20260522223908_schedule_retention_cleanup.sql:70` with `ERROR: can only create extension in database postgres` (`Jobs must be scheduled from the database configured in cron.database_name`). The migration's guard only checks `pg_available_extensions`. On `postgres:17-alpine` (Testcontainers and CircleCI) pg_cron is unavailable, so the migration skips. On **any** Supabase Postgres image, Docker or native, pg_cron is available but can only be created in `cron.database_name`. Every other migration applied cleanly.

**F7. Test bootstrap: `ALTER ROLE postgres BYPASSRLS` fails (check 7).** In `grantRlsPermissions` (`tests/helpers/db/bootstrap.ts`) the statement fails with `permission denied to alter role — Only superusers can alter privileged roles`. On Supabase images `postgres` is not a superuser but already has `rolbypassrls = true`. This also applies to any Supabase image.

**F8. `pnpm test integration --changed` selected nothing (check 7).** It printed `No test files found` because no test files differ from `origin/develop`. The global setup still ran and failed with F6.

**Check 7 with DB-only workarounds (no code changes).** The spike connected as `supabase_admin` (avoids F7) and ran `CREATE EXTENSION pg_cron` in `template1` once, with `cron.database_name` temporarily set to `template1` and then reset (avoids F6). The bootstrap then completed: roles, the `auth.jwt()` shim, migrations, grants, runtime fixups, template, and per-worker clones. `pnpm vitest run --config vitest.config.ts --project integration tests/integration` passed **88 files / 521 tests in 24.4 s**. Running as a superuser means tables were owned by `supabase_admin`, so this proves the schema and queries work on native Postgres, not the exact production privilege model. Pointing `cron.database_name` at the base database does not work: the pg_cron launcher holds a connection to it, and `CREATE DATABASE … TEMPLATE atlaris_test_base` then fails with `source database is being accessed by other users`.

### Roles and grants the bootstrap expects (tests/setup + tests/helpers/db)

| Expectation | Present on native? |
| ----------- | ------------------ |
| Roles `anon`, `authenticated`, `service_role` (created if missing) | Yes, already present |
| Extension `pgcrypto` in each test DB | Yes (available, created by bootstrap) |
| Create schema `auth` + `auth.jwt()` shim; `GRANT USAGE ON SCHEMA public, auth TO authenticated, anon` | Yes |
| Table, column, and sequence grants and revokes in `public`; default privileges | Yes |
| `ALTER ROLE postgres BYPASSRLS` as the connecting user | **No**: needs a superuser (F7) |
| `CREATE DATABASE` / `DROP DATABASE` / `pg_terminate_backend` for `atlaris_test_*` | Yes as `postgres` (CREATEDB) |
| Local-host guard in `resolveExternalPostgresUrl` | Yes: `127.0.0.1:<dynamic port>` is accepted |

## Blockers

- **B1. pg_cron (F5).** Upstream [supabase/cli#6977](https://github.com/supabase/cli/issues/6977). Until it is fixed, the repo's start and reset wrappers must run the `supabase_admin` `ALTER SYSTEM` and `stack restart` after every start on a new stack and after every `db reset`.
- **B2. Test bootstrap on Supabase images (F6, F7).** Needs code changes in tests and possibly the retention migration. These are not native-specific; they would block a Docker Supabase stack too.
- **B3. 1Password shadows the per-worktree database URL.** The local 1Password Environment injects `POSTGRES_URL` (currently `127.0.0.1:54322/postgres`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `LOCAL_PRODUCT_TESTING`, and `DEV_AUTH_USER_ID` through `op run`. Process environment beats `.env.local` in Next.js, so a dynamic-port `.env.local` is ignored under `pnpm dev`. Check 3 passed only because the stack still used port 54322. Removing the database variables from the Environment is a manual 1Password change.
- **B4. Release age.** CLI 2.119.0 clears `minimumReleaseAge` on 2026-10-07. Before then it needs the exclude above.

## Codebase changes A1–A3 will need

Grouping follows the JCS-119 ownership: A1 (JCS-122) owns `scripts/db/*`, `scripts/dev/*`, and config; A2 (JCS-123) owns cloud agents (`scripts/agents/*`); A3 (JCS-124) owns the test bootstrap.

**CLI and config (A1)**
- Bump `supabase` to ≥ 2.119.0 (after 2026-10-07, or with the exclude).
- Add `[experimental] stack = true` (or set `SUPABASE_EXPERIMENTAL_STACK=1` in the wrappers), and remove the fixed `port`/`shadow_port`/`inspector_port` keys listed above.
- Resolve F1: either `[studio] enabled = false` or enable `[api]`. Optionally rename `[inbucket]` to `[local_smtp]` to silence the deprecation warning.
- `scripts/db/cli.ts` `start`/`reset`: pass `--runtime native` (auto picks Docker whenever OrbStack is running), apply the pg_cron workaround after start and after every reset (B1), and use `--db-url …?sslmode=disable` when resetting a named stack.
- `scripts/dev/doctor.sh` and `start.sh --db`: check `supabase status --output-format json` (`readiness`) instead of `docker info`.
- Document a one-time `supabase stack destroy --yes` for existing stacks (F2).
- Update `docs/development/local-database.md`: the environments table, the ports table (dynamic 20000–32767), and troubleshooting.

**Per-worktree environment and dev launcher (A1, `scripts/dev/*`)**
- A `.env.local` writer that reads `env.DB_URL` from `supabase status --output-format json` and writes `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`.
- Resolve B3: drop `POSTGRES_URL` (and the Supabase URL and key) from the 1Password local Environment, or have `scripts/dev/start.sh` export the stack's `DB_URL` after `op run` injects.
- `scripts/dev/bootstrap-worktree.sh` currently symlinks the main checkout's `.env.local`. A per-worktree database needs a real per-worktree file instead.

**Cloud agents (A2)**
- Nothing in this spike ran on Linux. A2 must verify the native runtime on the cloud-agent images (glibc ≥ 2.35, non-root or `SUPABASE_NATIVE_POSTGRES_USER`, outbound access to GitHub releases for the ~483 MB artifact download) before replacing `scripts/agents/cloud-postgres.ts`.

**Test bootstrap (A3)**
- F6: guard the retention migration's `CREATE EXTENSION pg_cron` with `current_database() = current_setting('cron.database_name', true)`. This is a no-op on hosted, which runs in `postgres`. Alternatively, have the test bootstrap pre-install pg_cron in the template. A migration change goes through the hosted migration manifests.
- F7: in `grantRlsPermissions`, skip `ALTER ROLE postgres BYPASSRLS` when `rolbypassrls` is already true or the current user is not a superuser.
- Decide whether DB-backed tests use a named stack (for example `--stack test`) and read its URL from `supabase status --stack test --output-format json`, or keep Testcontainers locally. Tests do not need `db reset`, because the bootstrap builds its own `atlaris_test_*` databases.
- Keep CircleCI on the `postgres:17-alpine` sidecar unless a separate decision moves it.

## Spike cleanup state

- Committed: this file and its `docs/README.md` index entry only.
- Reverted with `git checkout`: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `supabase/config.toml`, followed by `pnpm install --frozen-lockfile`.
- Left in place: the spike `.env.local` (gitignored; points at `127.0.0.1:54322`) and `~/.supabase/cache/stack` (483 MB of artifacts, reusable by A1).
- All three spike stacks are stopped but not destroyed. Their data remains under `~/.supabase/stacks/`: `275b0bdd…` (A default, 67 MB), `7bdff3f1…` (A `test`, 184 MB), and `41864fab…` (the removed worktree B, 67 MB). Remove them with `supabase stack destroy --stack-id <id> --yes`.
- The temporary worktree `atlaris-jcs-121-b` was removed. OrbStack was quit, as it was before the spike. The main checkout's `supabase_db_atlaris` Docker volume was not touched.
