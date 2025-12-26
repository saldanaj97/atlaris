# Testing Guidelines (Vitest + Testing Library)

These guidelines are designed to keep the test suite:

- **Robust**: refactors shouldn’t break tests unless behavior changed.
- **Isolated**: tests don’t depend on order, shared state, or the network.
- **Readable**: a junior can add tests without touching unrelated files.
- **Fast**: most tests run in milliseconds; slow tests are rare and intentional.

---

## 1) Core principles (apply to all tests)

### Test behavior, not implementation

- Prefer assertions on **outputs, observable side effects, and user-visible behavior**.
- Avoid asserting internal calls, private variables, or “how” something was computed unless the call itself is the contract.

### Keep tests deterministic

- No real time, randomness, network, or shared global state unless that’s exactly what you’re validating.
- If production code uses time/random IDs, make them **injectable** (clock/uuid provider) or pass them as inputs.

### Tests must be order-independent

- A test should pass when run:
  - alone
  - after any other test
  - in parallel

- Never assume a previous test created data you need.

### Use DRY carefully

- **DRY the setup**, not the assertion.
- Repeated boilerplate belongs in helpers/builders.
- Repeated assertions might be hiding different intent; keep them explicit.

### File structure and naming

- Make sure to follow the project’s established conventions for test file locations and naming.
- Use clear and consistent naming patterns to indicate the purpose and scope of each test file.
- Group related tests together to enhance organization and maintainability.

### Favor “single reason to fail”

- A test should fail for one clear reason.
- If a test checks multiple behaviors, split it.

### Prefer stable selectors / contracts

- UI tests: prefer semantic queries (roles, labels) over brittle selectors.
- API tests: prefer stable contracts (status codes, response shapes, invariants).

---

## 2) Choose the right test type

### The practical pyramid

- **Unit tests**: validate pure logic and decision-making.
- **Integration tests**: validate multiple modules working together (DB + repository + service, UI + state + adapters, etc.).
- **E2E tests**: validate user journeys across the system.

### Rule of thumb

- If you need **no IO** and can pass data directly: write a **unit** test.
- If you need **real boundaries inside your app** (db queries, adapters, serialization, routing logic): write an **integration** test.
- If you need to validate **a full flow from the user’s perspective**: write an **E2E** test.

---

## 3) Project boundaries and dependency strategy

### Define “what’s real” per test layer

- Unit tests: real code, **fake dependencies**.
- Integration tests: real code, **real internal adapters** (DB/repo/validation), fake third-party dependencies.
- E2E tests: as much real as possible, with controlled test data.

### Prefer dependency injection over module mocking

- Make dependencies **parameters** (constructor args, function args, context objects).
- In tests, pass `{ send: vi.fn() }`, not `vi.mock('email-service')`.

### Avoid vendor lock-in in your business logic

- Your core logic should not import vendor SDKs directly.
- Wrap vendors behind thin interfaces and test vendors in isolation.

---

## 4) Unit testing guidelines

Unit tests should be boring: small inputs, direct outputs, no environment.

### What to unit test

- Pure functions and business rules.
- Edge cases and branching logic.
- Data transformation and validation rules.

### What not to unit test

- Framework glue (Next.js handler wrappers, router wiring, component library internals).
- Pass-through functions that don’t have meaningful logic.

### Structure

- Use **Arrange / Act / Assert** (AAA) or **Given / When / Then**, consistently.
- Prefer table-driven tests for many cases:

```ts
import { describe, it, expect } from 'vitest';

it.each([
  { input: 0, expected: 'free' },
  { input: 10, expected: 'starter' },
])('assignTier($input) -> $expected', ({ input, expected }) => {
  expect(assignTier(input)).toBe(expected);
});
```

### Mocking rules for unit tests

- **Default**: do not mock modules.
- **Allowed**:
  - `vi.fn()` for injected dependencies
  - `vi.spyOn(obj, 'method')` when you own the object and the spy is part of the contract

- If you need `vi.mock()` frequently, it’s a signal the code needs better boundaries.

### Time and randomness

- Prefer passing `now` / `clock` and `idGenerator` into the function.
- Use fake timers only when testing timer behavior as a feature.

---

## 5) Integration testing guidelines

Integration tests prove real parts of your system cooperate correctly.

### What to integrate

- **Repository ↔ DB**: query correctness, constraints, migrations.
- **Service ↔ repository ↔ validation**: orchestration + business rules.
- **UI ↔ state ↔ adapters**: user interactions and state transitions.

### Keep integration tests hermetic

- No real calls to:
  - third-party auth providers
  - remote databases
  - analytics, email, payments

- Replace those with fakes/stubs at the boundary.

### Database strategy (if you use a real DB in tests)

Choose one approach and document it:

1. **Transaction rollback per test** (fast, clean)
2. **Truncate tables per test/suite** (slower, simple)
3. **Ephemeral DB per worker** (most isolated, most setup)

Rules:

- Each test should control its own data.
- Use factories/seed helpers, not manual JSON.
- Reset DB state reliably in `beforeEach/afterEach`.

### Guardrails: prevent dangerous environments

- Fail fast if the test environment points at a non-test database.
- Example:

```ts
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Tests must run with NODE_ENV=test');
}

if (
  process.env.DATABASE_URL?.includes('prod') ||
  process.env.DATABASE_URL?.includes('neon.tech')
) {
  throw new Error('Refusing to run tests against a remote database');
}
```

### Integration test assertions

- Assert **invariants** and **contracts**:
  - response shape
  - status codes
  - persisted data (and only what matters)
  - error mapping

- Avoid over-asserting on full objects; it creates brittle coupling.

### Control async and concurrency

- Vitest may run tests concurrently.
- If a suite relies on shared resources (ports, files, DB schema), run it serially **and document why**.

---

## 6) E2E testing guidelines

E2E tests are expensive and flaky by default. Keep them few and meaningful.

### What E2E tests are for

- Critical user journeys:
  - sign in/sign out
  - create/update/delete core entities
  - key payment/gating flows (if applicable)
  - “happy path” plus a few high-risk failure paths

### E2E test design rules

- One test = one journey.
- Assert only what a user would care about.
- Avoid pixel-perfect assertions and brittle layout coupling.

### Data setup

- Prefer creating data through APIs/UI the same way users do.
- If seeding is necessary, use a single, versioned seed entry point.
- Every test must be able to run on a clean slate.

### Flake prevention

- Never use arbitrary sleeps.
- Wait for specific states:
  - element visible/enabled
  - request finished (if your runner supports it)
  - URL changed

- Keep timeouts realistic but not huge.

> Note: true browser E2E is best done with a browser runner (e.g., Playwright). If your “E2E” is currently Vitest + jsdom, treat it as **app-level integration** and keep the same robustness rules (user-visible behavior, stable selectors, hermetic dependencies).

---

## 7) React Testing Library guidelines (jsdom)

### Always test through the user

- Prefer `userEvent` over calling DOM APIs directly.
- Prefer role/label queries:
  - `getByRole('button', { name: /save/i })`
  - `getByLabelText(/email/i)`

### Query priority

1. `getByRole` / `findByRole`
2. `getByLabelText` / `getByPlaceholderText`
3. `getByText` (careful; copy changes)
4. `getByTestId` (last resort; use stable IDs when semantics don’t exist)

### Async UI

- Use `findBy*` for async rendering.
- Use `waitFor` only when you cannot wait on a specific element state.

### Assertions

- Assert the smallest meaningful thing.
- Prefer `toBeInTheDocument`, `toHaveTextContent`, `toBeDisabled`, etc.

### Cleanup

- Ensure DOM and mocks are reset between tests.
- Standardize in your setup:
  - `afterEach(() => vi.restoreAllMocks())`
  - `afterEach(() => cleanup())` (if not already configured)

---

## 8) Fixtures, factories, and test utilities (DRY without coupling)

### Use builders/factories for test data

- Centralize defaults, allow overrides.

```ts
export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    email: 'test@example.com',
    role: 'user',
    ...overrides,
  };
}
```

Rules:

- Factories live in one place (e.g., `tests/_fixtures`).
- Factories produce **valid by default** objects.
- Don’t retype huge objects in test files.

### Create “harnesses” for repeated setup

- Example: `renderWithProviders(ui, { user, route })`
- Keep helpers small; avoid hiding important behavior.

### Avoid shared mutable fixtures

- Factories should return new objects each call.
- Never export a mutable object literal used across tests.

---

## 9) Coverage (useful, not a goal)

- Coverage is a **signal** to find untested branches.
- Do not write tests for trivial pass-through code just to increase numbers.
- Prioritize:
  - branch/condition coverage for complex logic
  - error handling paths
  - high-risk modules

Recommended:

- Maintain a minimum threshold for **branches** and **functions**, and raise it gradually.

---

## 10) Anti-patterns to reject in PR review

- Tests that assert internal method call counts without a contract reason.
- Tests that depend on execution order or shared global state.
- Copy/pasted mock objects in every file instead of factories.
- Snapshot tests for dynamic content or large DOM trees.
- Arbitrary `setTimeout`/sleep to “fix flake”.
- Tests that hit real external services.
- Tests that require editing unrelated tests to add a new one.

---

## 11) PR checklist

### For unit tests:

- [ ] No IO dependencies (network/FS/DB)

- [ ] No module-level mocking unless justified (prefer injected fakes)

- [ ] Deterministic (time/random injected or controlled)

- [ ] Asserts behavior/contract, not internal implementation details

- [ ] Single reason to fail (split if multiple behaviors)

### For integration tests:

- [ ] Real internal boundaries exercised (e.g., service + repo + validation)

- [ ] External services faked at the boundary (no real third-party calls)

- [ ] Data setup/cleanup is reliable and local to the suite/test

- [ ] Assertions focus on invariants/contracts (avoid full-object over-asserting)

- [ ] Guardrails prevent using prod/remote resources

### For E2E tests:

- [ ] Covers a critical user journey (few, high-value)

- [ ] Minimal assertions; checks what a user cares about

- [ ] No sleeps; waits for explicit states (element/URL/request)

- [ ] Independent data (seeded or created) and cleanup/restart strategy

---

## 12) If tests feel brittle, fix the architecture

If adding a test forces you to:

- mock multiple modules,
- thread framework request objects through business logic,
- or create complex environment scaffolding,

that’s not a “testing problem.” It’s a **boundary problem**.\

**Refactor toward:**

- pure logic in small functions
- thin adapters at the edges
- injected dependencies
- explicit context objects
