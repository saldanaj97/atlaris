# Plan: worker-isolated integration databases

## Scope

Targeted refactor only for test infrastructure so integration tests can use parallel Vitest workers safely. Keep production DB runtime behavior intact unless a minimal test-only client reset is required. Do not migrate e2e/security off the conservative single-worker path in this pass.

## Finalized design

1. Start one PostgreSQL Testcontainer for the run.
2. Inside that container, create and bootstrap `atlaris_test_base` once.
3. Apply migrations/bootstrap/fixups to `atlaris_test_base` once.
4. Create `atlaris_test_template` from the prepared base DB.
5. For each worker, derive a deterministic DB name from `VITEST_POOL_ID` such as `atlaris_test_w1`.
6. In `tests/setup/test-env.ts`, recreate that worker DB from `atlaris_test_template` before any later setup file can initialize the service-role client.
7. Keep per-file truncation/reset inside the current worker DB only. No cross-worker mutex.

## Step 0.0 — Baseline and acceptance confirmation

- Confirmed init order: `globalSetup` runs before worker processes; `setupFiles` execute in listed order inside each worker; `tests/setup/db.ts` currently installs `beforeEach/afterEach`; the service-role module lazily initializes on first access but caches the first URL it sees.
- Shared-state conflict points:
  - `tests/setup/testcontainers.ts` writes one shared `DATABASE_URL`.
  - `tests/setup/db.ts` uses one process-local mutex to serialize resets.
  - `tests/helpers/db/reset.ts` truncates and re-applies bootstrap concerns in the shared DB.

## Step 1.0 — Provisioning helpers

- Add a small helper module under `tests/setup/` for admin-safe DB provisioning.
- API surface:
  - `getBaseDbName()`
  - `getTemplateDbName()`
  - `getWorkerDbName(workerId)`
  - `createDatabaseUrl(baseUrl, dbName)`
  - `ensureTemplateDatabase(...)`
  - `recreateWorkerDatabaseFromTemplate(...)`
  - `dropDatabaseIfExists(...)`
- Use an admin connection targeting `postgres`, terminate active connections before drop, and never drop the DB currently connected by the admin client.

## Step 2.0 — Global setup bootstrap

- Refactor `tests/setup/testcontainers.ts` so it only owns one-time container work.
- Start the container with a non-`postgres` app DB name.
- Bootstrap/migrate/grant permissions against `atlaris_test_base`.
- Run any one-time schema/auth fixups needed in the template rather than every file.
- Persist enough metadata for workers to derive admin/base/template URLs.

## Step 3.0 — Worker-aware env setup

- Refactor `tests/setup/test-env.ts` to:
  - read the global setup metadata file,
  - derive `VITEST_POOL_ID`,
  - recreate the worker DB from template,
  - set `DATABASE_URL`, `DATABASE_URL_NON_POOLING`, `DATABASE_URL_UNPOOLED`, `TEST_WORKER_ID`, and `TEST_WORKER_DB_NAME` before later setup imports use the DB client.
- Add low-noise debug logging gated by `TEST_DB_DEBUG` or `DEBUG`.

## Step 4.0 — Local reset and client lifecycle

- Remove the shared reset mutex from `tests/setup/db.ts`.
- Keep per-file reset and `ensureStripeWebhookEvents()`, but scope them to the worker DB.
- Move durable bootstrap work out of `resetDbForIntegrationTestFile()` where it only needs to exist once in the template DB.
- If the cached service-role client can survive a worker DB URL change inside a process, add a minimal test-only reset hook in `src/lib/db/service-role.ts` and use it only from test setup.

## Step 5.0 — Controlled config and DX changes

- Update integration project config to `maxWorkers: 2` with a comment explaining worker-isolated DBs.
- Keep `maxConcurrency: 1` unless validation proves otherwise.
- Keep e2e/security at 1 worker.
- Allow `INTEGRATION_MAX_WORKERS` env override in the runner or config without changing the default stability posture.

## Validation steps

1. Run a clean 1-worker integration pass.
2. Run a clean 2-worker integration pass.
3. Repeat the 2-worker pass multiple times.
4. Run `pnpm test:changed` and `pnpm check:full` as the final baseline.
5. Record any residual risks if security/e2e still share the old single-DB path.

## Issue verification and closure

- Verify acceptance criteria explicitly:
  - integration no longer shares one DB across workers,
  - worker DB names are deterministic from `VITEST_POOL_ID`,
  - per-file resets are still present but worker-local,
  - integration uses 2 workers,
  - e2e/security remain conservative,
  - local commands and risks are documented.
