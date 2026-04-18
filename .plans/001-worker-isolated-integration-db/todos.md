# worker-isolated-integration-db todos

- [x] Slice 0: Read the current Vitest/Testcontainers/test setup wiring and record the exact initialization order plus the shared-database conflict points.
- [x] Slice 1: Finalize the isolation strategy as one Postgres container, one prepared base DB, one template DB, and one cloned DB per Vitest worker.
- [x] Slice 2: Add explicit test DB provisioning helpers for deterministic DB naming, admin connections, template creation, worker DB recreation, and safe dropping.
- [x] Slice 3: Refactor `tests/setup/testcontainers.ts` so global setup creates one container, bootstraps the base DB once, and creates the template DB.
- [x] Slice 4: Refactor `tests/setup/test-env.ts` to derive `VITEST_POOL_ID`, recreate the worker DB from the template, and set worker-specific DB env vars before later imports.
- [x] Slice 5: Remove shared-DB serialization from `tests/setup/db.ts` while keeping per-file reset local to the current worker DB.
- [x] Slice 6: Split one-time bootstrap concerns from per-file reset concerns in `tests/helpers/db/*` and keep resets cheap/local.
- [x] Slice 7: Update `vitest.config.ts` and test runner support so integration runs with parallel workers (default 4 after Slice 11), while e2e/security remain conservative.
- [x] Slice 8: Audit DB client caching and add the smallest safe test-only reset path if the service-role singleton can hold a stale worker URL.
- [x] Slice 9: Update integration DX/docs/scripts only where needed for `INTEGRATION_MAX_WORKERS` and test DB debug support.
- [x] Slice 10: Validate 1-worker and repeated 2-worker integration runs, then document outcomes, remaining risks, and local verification commands.
- [x] Slice 11: Stabilize 4-worker integration — track inline regeneration drains (`registerInlineDrain`, `waitForInlineRegenerationDrains`), await drains before DB reset in `tests/setup/db.ts`, default `REGENERATION_INLINE_PROCESSING=false` in `tests/setup/test-env.ts`, profile PUT uses DB `now()` for `updatedAt`, validate 2-worker + three consecutive 4-worker full runs, default `INTEGRATION_MAX_WORKERS` to 4 in `vitest.config.ts`.

## Baseline note

- Current init order for DB-backed Vitest projects is: `globalSetup: tests/setup/testcontainers.ts` -> `setupFiles: tests/setup/test-env.ts` -> `tests/setup.ts` -> `tests/setup/db.ts` -> test module imports/use. `DATABASE_URL` is first set in `tests/setup/testcontainers.ts` after the Testcontainer starts and is then propagated through `.testcontainers-env.json` in `tests/setup/test-env.ts`.
- The first shared DB client import happens in `tests/setup.ts` (`@/lib/db/service-role`) and throughout many integration helpers/specs. `src/lib/db/service-role.ts` is lazy on first use, but once initialized it caches a process-local singleton `postgres` client and Drizzle client against the then-current env URL.
- Parallel workers currently conflict because every worker sees the same `DATABASE_URL`, `tests/setup/db.ts` serializes `resetDbForIntegrationTestFile()` behind a global mutex, and `tests/helpers/db/reset.ts` truncates and re-applies auth/RLS/schema fixups inside that shared database before each file.

## Review

- Changed files:
  - `vitest.config.ts`
  - `tests/setup/testcontainers.ts`
  - `tests/setup/test-env.ts`
  - `tests/setup/db.ts`
  - `tests/setup/db-provisioning.ts`
  - `tests/setup.ts`
  - `tests/helpers/db/reset.ts`
  - `tests/helpers/db/truncate.ts`
  - `tests/helpers/db/runtime-fixups.ts`
  - `src/lib/db/service-role.ts`
  - `src/features/jobs/regeneration-worker.ts`
  - `src/app/api/v1/plans/[planId]/regenerate/route.ts`
  - `src/app/api/v1/user/profile/route.ts`
  - `scripts/tests/integration/runner.ts`
  - `tests/AGENTS.md`
  - `tests/unit/setup/db-provisioning.spec.ts`
  - `tests/unit/helpers/truncate-safety.spec.ts`
- Validation summary:
  - ✅ `pnpm vitest run tests/unit/setup/db-provisioning.spec.ts tests/unit/helpers/truncate-safety.spec.ts`
  - ✅ `INTEGRATION_MAX_WORKERS=1 pnpm test:integration`
  - ✅ `INTEGRATION_MAX_WORKERS=2 TEST_DB_DEBUG=true pnpm test:integration`
  - ✅ `INTEGRATION_MAX_WORKERS=2 pnpm test:integration` (two additional passes)
  - ✅ `pnpm test:changed`
  - ✅ Slice 11: targeted integration (`jobs.queue`, `regeneration-worker-process`, `user-profile`, `plans.regenerate`) + `INTEGRATION_MAX_WORKERS=2 pnpm test:integration` + three consecutive `INTEGRATION_MAX_WORKERS=4 pnpm test:integration`
  - ⚠️ `pnpm check:type`
  - ⚠️ `pnpm check:full`
- Remaining validation blocker: existing unrelated type errors in `src/components/ui/calendar.tsx`, `src/components/ui/date-picker.tsx`, `src/components/ui/hover-card.tsx`, `src/components/ui/popover.tsx`, and `src/components/ui/radio-group.tsx` prevent a clean type/lint baseline in the current tree.
