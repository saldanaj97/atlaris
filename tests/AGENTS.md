# Tests Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Vitest multi-project setup with 5 test types. DB reset between tests. Factories for test data.

## Structure

```
tests/
├── unit/              # Pure logic, no IO (fast, parallel)
│   ├── ai/
│   ├── api/
│   ├── components/
│   ├── scheduling/
│   └── setup.ts       # Unit-specific setup
├── integration/       # DB + service (sequential, isolated)
│   ├── api/
│   ├── db/
│   ├── stripe/
│   └── generation/
├── e2e/               # User journeys (sequential)
├── security/          # RLS policy verification (sequential)
├── smoke/             # Startup checks (sequential)
├── fixtures/          # Test data factories
├── helpers/           # DB reset, test utilities
│   └── db.ts          # truncateAll(), resetDbForIntegrationTestFile()
├── mocks/
│   ├── shared/        # Cross-test mocks (google-api)
│   ├── unit/          # Unit test mocks
│   └── e2e/           # E2E mocks
├── setup/
│   └── test-env.ts    # Environment defaults
└── setup.ts           # Global setup (integration/e2e/security)
```

## Test Types

| Type        | Config                | Concurrency | DB  | Timeout |
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
pnpm test:integration                  # Integration tests
RUN_RLS_TESTS=1 pnpm exec vitest run --project security tests/security/  # Security (RLS) tests
./scripts/test-unit.sh path/to/file    # Single file
```

**NEVER run `pnpm test:all` unless absolutely necessary.**

## DB Lifecycle (Integration/E2E/Security)

```typescript
// tests/setup.ts
beforeEach(async () => {
  await resetDbForIntegrationTestFile(); // Truncates all tables
  await ensureStripeWebhookEvents(); // Ensures required tables exist
  // ...
});

afterEach(() => {
  cleanup(); // React Testing Library
});
```

Guardrails prevent truncating non-test databases.

## Writing Tests

### Unit Tests

```typescript
// tests/unit/scheduling/distribute.spec.ts
import { describe, it, expect } from 'vitest';
import { distributeTasks } from '@/lib/scheduling/distribute';

describe('distributeTasks', () => {
  it('distributes evenly across available slots', () => {
    const result = distributeTasks(tasks, slots);
    expect(result).toHaveLength(slots.length);
  });
});
```

No DB, no mocks if possible. Inject dependencies.

### Integration Tests

```typescript
// tests/integration/db/plans.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import { createTestUser, createTestPlan } from '@/tests/fixtures';

describe('Plan queries', () => {
  let userId: string;

  beforeEach(async () => {
    // DB already reset by setup.ts
    const user = await createTestUser();
    userId = user.id;
  });

  it('creates plan with modules', async () => {
    const plan = await createTestPlan({ userId });
    expect(plan.modules).toHaveLength(3);
  });
});
```

## Factories

```typescript
// tests/fixtures or inline
export async function createTestUser(overrides = {}) {
  return db
    .insert(users)
    .values({
      clerkUserId: `user_${nanoid()}`,
      email: `test-${nanoid()}@example.com`,
      ...overrides,
    })
    .returning();
}
```

Always use factories, never hardcoded IDs.

## Mocking

Prefer dependency injection over `vi.mock()`:

```typescript
// Good: DI
const mockProvider = { generate: vi.fn() };
await runGenerationAttempt(ctx, { provider: mockProvider });

// Avoid: Module mock
vi.mock('@/lib/ai/provider-factory');
```

Shared mocks in `tests/mocks/shared/` (e.g., Google API rate limiter).

## Anti-Patterns

- Running full test suite
- Depending on test execution order
- Hardcoding IDs (use factories)
- Asserting on CSS classes
- Using `setTimeout` for async (use `waitFor`)
- Mocking what you can inject

## Security Test Expectations (RLS)

- Verify anonymous cannot read user-facing app data
- Verify anonymous write attempts fail on user-owned tables
- Verify authenticated users keep existing own-data behavior
- Verify `pg_policies` metadata for user-facing tables is `authenticated`-scoped and not `PUBLIC`
