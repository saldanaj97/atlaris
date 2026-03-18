# Tests Module

**Parent:** [Root AGENTS.md](../AGENTS.md)

## General Principles

- Make sure to always update the test suite when making changes to the codebase, especially for critical paths like plan generation and billing.
- Make sure to update the docs when making changes to the test suite, especially if you add new patterns or change existing ones.
- Always run the relevant tests locally before marking any task as done, and use `pnpm test:changed` to verify that you are running the right tests.

### Docs

ALWAYS refer to these docs for testing standards and patterns when writing, auditing, or editing tests(this is non-negotiable):

- [Test standards & principles](../docs/testing/test-standards.md) — test pyramid, RTL guidelines, PR checklist
- [DB test patterns](../docs/testing/db-test-patterns.md) — Drizzle mocking, SQL capture, fixtures

## Structure

```
tests/
├── unit/              # Pure logic, no IO (fast, parallel)
├── integration/       # DB + service (sequential, isolated)
├── e2e/               # User journeys (sequential)
├── security/          # RLS policy verification (sequential)
├── fixtures/          # Test data factories (users, plans, ids)
├── helpers/           # DB reset, test utilities
├── mocks/             # shared/, unit/, e2e/
├── setup/             # test-env.ts, testcontainers.ts
└── setup.ts           # Global setup (integration/e2e/security)
```

## Test Types

| Type        | Setup                 | Concurrency | DB  | Timeout |
| ----------- | --------------------- | ----------- | --- | ------- |
| Unit        | `tests/unit/setup.ts` | Parallel    | No  | 20s     |
| Integration | `tests/setup.ts`      | Sequential  | Yes | 90s     |
| E2E         | `tests/setup.ts`      | Sequential  | Yes | 90s     |
| Security    | `tests/setup.ts`      | Sequential  | Yes | 90s     |
| Smoke       | —                     | Sequential  | No  | 90s     |

## Commands

```bash
pnpm test                              # Unit tests only
pnpm test:changed                      # Changed files
./scripts/test-unit.sh path/to/file    # Single unit test file
./scripts/test-integration.sh path     # Single integration file (Testcontainers)
pnpm test:integration                  # Full integration suite
RUN_RLS_TESTS=1 pnpm exec vitest run --project security tests/security/
```

**Prerequisite for integration tests:** Docker must be running (Testcontainers spins up an ephemeral Postgres automatically).

To skip Testcontainers and use an existing database (e.g. CI):

```bash
SKIP_TESTCONTAINERS=true DATABASE_URL="..." pnpm vitest run --project integration tests/integration/db/plans.spec.ts
```

## DB Lifecycle (Integration/E2E/Security)

`tests/setup.ts` runs `resetDbForIntegrationTestFile()` in `beforeEach` to truncate all tables. Guardrails prevent truncating non-test databases.

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
- **Run only what you changed** — `pnpm test:changed` or `./scripts/test-unit.sh path/to/file`
- **Verify after changes** — run `pnpm test:changed` before marking any task done
- **Use `seedFailedAttemptsForDurableWindow()`** for durable generation-window tests (from `tests/fixtures/attempts.ts`)

### Don't

- **Don't run `pnpm test:all` or full integration suite locally** — target specific files
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
