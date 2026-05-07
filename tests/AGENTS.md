---
description:
alwaysApply: false
---

# Tests Module

**Parent:** [Root AGENTS.md](../AGENTS.md)

## General Principles

- Make sure to always update the test suite when making changes to the codebase, especially for critical paths like plan generation and billing.
- Make sure to update the docs when making changes to the test suite, especially if you add new patterns or change existing ones.
- Always run the relevant tests locally before marking any task as done, and use explicit scoped commands such as `pnpm test:unit:changed` or `pnpm test:integration:changed` to verify you are running the right tests.
- After running the tests, update the `tests/results/<test-category>/<date>-results.md` file with the results of the tests.

### Docs

ALWAYS refer to these docs for testing standards and patterns when writing, auditing, or editing tests (this is non-negotiable):

- [Test standards & principles](../docs/testing/test-standards.md) — test pyramid, RTL guidelines, PR checklist
- [DB test patterns](../docs/testing/db-test-patterns.md) — Drizzle mocking, SQL capture, fixtures
- [Playwright local smoke](../docs/testing/playwright-local-smoke.md) — disposable DB browser smoke architecture and ownership

## Structure

```
tests/
├── unit/              # Pure logic, no IO (fast, parallel)
├── integration/       # DB + service (sequential, isolated)
├── e2e/               # User journeys (sequential)
├── playwright/        # Browser smoke tests (Playwright + disposable DB)
├── security/          # RLS policy verification (sequential)
├── fixtures/          # Test data factories (users, plans, ids)
├── helpers/           # DB reset, test utilities
├── mocks/             # shared/, unit/, e2e/
├── setup/             # test-env.ts, testcontainers.ts
└── setup.ts           # Global setup (integration/e2e/security)
```

## Import paths

Use the same path aliases as the rest of the repo instead of long `../../../../` chains:

- **`@/`** — application code under `src/` (e.g. components under test, shared modules). Matches production import style.
- **`@tests/`** — anything under `tests/` (fixtures, `helpers/`, `mocks/`, shared test utilities). Example: `@tests/helpers/deferred-promise`, `@tests/mocks/unit/client-logger.unit`, `@tests/fixtures/plans`.

Aliases are defined in `tsconfig.json` (`paths`) and in Vitest’s `testAliases` (`vitest.config.ts`) so unit tests resolve them reliably. When a file must load side-effect mocks **before** other imports, keep that order; Prettier does not organize imports, so do not add import-sorting tooling casually.

## Test Types

| Type        | Setup                 | Concurrency                           | DB                  | Timeout |
| ----------- | --------------------- | ------------------------------------- | ------------------- | ------- |
| Unit        | `tests/unit/setup.ts` | Parallel                              | No                  | 20s     |
| Integration | `tests/setup.ts`      | Sequential                            | Yes                 | 90s     |
| E2E         | `tests/setup.ts`      | Sequential                            | Yes                 | 90s     |
| Security    | `tests/setup.ts`      | Sequential                            | Yes                 | 90s     |
| Smoke       | Playwright            | Serial local runner; auth spec serial | Disposable Postgres | 180s    |

## Commands

```bash
pnpm test                              # Changed unit + integration bundle
pnpm test:changed                      # Explicit alias for changed unit + integration bundle
pnpm test:unit                         # Unit tests only
pnpm test:unit:changed                 # Changed unit tests
pnpm test:unit:watch                   # Watch unit tests
pnpm exec tsx scripts/tests/run.ts unit path/to/file    # Single unit test file
pnpm exec tsx scripts/tests/run.ts integration path     # Single integration file (Testcontainers)
pnpm test:integration:changed          # Changed integration tests
pnpm test:integration                  # Full integration suite
pnpm test:security                     # RLS policy tests (Testcontainers; requires Docker)
pnpm test:smoke                        # Playwright smoke: ephemeral DB + anon/auth app servers
pnpm test:smoke -- --project smoke-anon  # Anon-only smoke iteration
pnpm test:smoke -- --project smoke-auth  # Auth-only smoke iteration
pnpm exec tsx scripts/tests/smoke/run.ts --smoke-step=db  # DB-only smoke infra validation
```

**Prerequisite for integration and security tests:** Docker must be running (Testcontainers spins up an ephemeral Postgres automatically).
**Prerequisite for smoke tests:** Docker must be running and Playwright Chromium must be installed (`pnpm exec playwright install chromium`).

## Browser Smoke Ownership

- `pnpm test:smoke` is the only supported entrypoint for committed browser smoke coverage.
- **UI audit baselines** (`pnpm ui:capture-baseline`): see [UI baseline capture](../docs/testing/ui-baseline-capture.md) — separate from smoke; disposable DB + dual dev servers or `--anon-base` / `--auth-base`.
- `scripts/tests/smoke/run.ts` owns the disposable Postgres lifecycle and passes `SMOKE_STATE_FILE` to Playwright.
- Playwright owns both app servers; do not start smoke servers manually for normal runs.
- `scripts/tests/smoke/start-app.ts` is the only supported launcher for anon/auth smoke modes.
- Shared smoke runtime modules live under `tests/helpers/smoke/`; keep `scripts/tests/smoke/` limited to entrypoints.
- Do not touch `.env.local` for smoke runs. Mode selection comes from launcher-owned process env only.
- Use Playwright `request` for redirect/proxy assertions and `page` for user journeys.
- Keep the auth browser lane deterministic. The current local runner stays serial for stability; do not re-enable project-level parallelism casually.

To skip Testcontainers and use an existing database (e.g. CI):

```bash
SKIP_TESTCONTAINERS=true DATABASE_URL="..." pnpm vitest run --project integration tests/integration/db/plans.spec.ts
```

## DB Lifecycle (Integration/E2E/Security)

`tests/setup/db.ts` runs `waitForInlineRegenerationDrains()` then `resetDbForIntegrationTestFile()` in `beforeEach` to avoid leaked regeneration drains racing the next test, then truncates all tables. Guardrails prevent truncating non-test databases.

Integration Vitest workers default to **4** (`vitest.config.ts`); override with `INTEGRATION_MAX_WORKERS` (e.g. `2` for a slower, lighter run). `SKIP_TESTCONTAINERS=true` still forces a single worker.

CI honors the same env var. Both `ci-pr.yml :: integration-light` and `ci-trunk.yml :: integration-tests` resolve `INTEGRATION_MAX_WORKERS` as: `workflow_dispatch` input `integration_workers` ⟶ repo variable `INTEGRATION_MAX_WORKERS` ⟶ default `'4'`. To globally drop CI to a 2-worker fallback without code edits, set the **repo variable** `INTEGRATION_MAX_WORKERS=2` (Settings → Variables → Actions). For a one-off rerun, dispatch the workflow with `integration_workers=2`. The dispatch input `test_db_debug=true` enables `[Test DB] worker N -> atlaris_test_wN` logging via `shouldLogTestDbDebug()` for that run.

Unless set in the environment, `tests/setup/test-env.ts` sets `REGENERATION_INLINE_PROCESSING=false` so specs opt in explicitly when they need inline queue drains.

## Do's and Don'ts

### Do

- **Test behavior, not implementation** — assert outputs, side effects, and user-visible results
- **Inject dependencies** — pass mock clients/providers as function args (`{ provider: vi.fn() }`)
- **Use factories** — `buildUserFixture()`, `createTestPlan()`, `createId()` from `tests/fixtures/`
- **One assertion focus per test** — each test should fail for one clear reason
- **Use semantic queries for UI** — `getByRole`, `getByLabelText`, `findByRole` (in that priority order)
- **Use `findBy*` for async UI** — not `waitFor` unless no specific element to wait on
- **Use `it.each` for many cases** — table-driven tests keep branching logic coverage clean
- **Make time/randomness injectable** — pass `now`/`clock`/`idGenerator` into functions
- **Run only what you changed** — `pnpm test:unit:changed`, `pnpm test:integration:changed`, or a targeted script file
- **Verify after changes** — run the most specific changed-scope command before marking any task done
- **Use `seedFailedAttemptsForDurableWindow()`** for durable generation-window tests (from `tests/fixtures/attempts.ts`)

### Don't

- **Don't run `pnpm test:all` or the full integration suite locally** — target specific files
- **Don't use `vi.mock()` when you can inject** — frequent module mocking signals bad boundaries
- **Don't hardcode IDs** — always use factories or `createId()`
- **Don't assert on CSS classes** — no `toHaveClass('flex')`, use roles/labels/attributes instead
- **Don't use `setTimeout`/sleep for async** — use `waitFor` or `findBy*`
- **Don't depend on test execution order** — each test must pass in isolation
- **Don't snapshot dynamic content** — snapshots on large DOM trees or changing data are brittle
- **Don't over-assert full objects** — assert the contract (status, shape, key fields), not every property
- **Don't test framework glue** — skip Next.js handler wrappers, router wiring, component library internals
- **Don't copy-paste mock objects** — extract to factories or shared builders in `tests/fixtures/`
- **Don't write tests just for coverage numbers** — prioritize branches, error paths, and high-risk modules

## Security Tests (RLS)

- Anonymous cannot read user-facing data
- Anonymous write attempts fail on user-owned tables
- Authenticated users retain own-data access
- `pg_policies` metadata is `authenticated`-scoped, not `PUBLIC`
