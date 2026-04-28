# Database Query Helper Test Patterns

Concrete, copy-paste-ready patterns for testing Drizzle query helpers in this project.
For general testing principles (test pyramid, React Testing Library, E2E, etc.), see [test-standards.md](./test-standards.md).

---

## Quick Reference

### Mock Drizzle Query Builder Chain

```typescript
// SELECT
const where = vi.fn().mockResolvedValue([{ id: 'user-1', name: 'Alice' }]);
const from = vi.fn().mockReturnValue({ where });
const select = vi.fn().mockReturnValue({ from });

const mockDb = { select } as unknown as ReturnType<typeof getDb>;
```

```typescript
// INSERT
const returning = vi
  .fn()
  .mockResolvedValue([
    { id: 'user-1', authUserId: 'auth-1', email: 'test@example.com' },
  ]);
const values = vi.fn().mockReturnValue({ returning });
const insert = vi.fn().mockReturnValue({ values });

const mockDb = { insert } as unknown as ReturnType<typeof getDb>;
```

```typescript
// UPDATE
const returning = vi
  .fn()
  .mockResolvedValue([{ id: 'user-1', preferredAiModel: 'claude-3' }]);
const where = vi.fn().mockReturnValue({ returning });
const set = vi.fn().mockReturnValue({ where });
const update = vi.fn().mockReturnValue({ set });

const mockDb = { update } as unknown as ReturnType<typeof getDb>;
```

### Capture and Inspect SQL Clauses

```typescript
import { PgDialect } from 'drizzle-orm/pg-core';

const pgDialect = new PgDialect();
let capturedWhere: Parameters<PgDialect['sqlToQuery']>[0] | undefined;

const mockWhere = vi.fn().mockImplementation((whereClause: unknown) => {
  capturedWhere = whereClause as Parameters<PgDialect['sqlToQuery']>[0];
  return { returning: vi.fn().mockResolvedValue([{ id: 'plan-1' }]) };
});

// Later, inspect the captured SQL:
const query = pgDialect.sqlToQuery(capturedWhere);
expect(query.sql).toContain('"learning_plans"."id"');
expect(query.params).toEqual([planId, userId, 'ready']);
```

### Transaction Mocks

```typescript
// Global setup in tests/unit/setup.ts prevents real DB access.
// Override in individual tests when you need a real mock tx:
const mockTransaction = vi.fn(async (fn) => {
  const mockTx = {
    delete: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn() }),
    }),
    update: vi
      .fn()
      .mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  };
  return fn(mockTx);
});

mockedDb.transaction = mockTransaction;
```

### Fixtures

```typescript
import { buildUserFixture } from '@tests/fixtures/users';
import { createTestPlan } from '@tests/fixtures/owned-plan-record';
import { createId } from '@tests/fixtures/ids';

const user = buildUserFixture({
  subscriptionTier: 'pro',
  email: 'custom@example.com',
});
const plan = createTestPlan({
  userId: user.id,
  generationStatus: 'generating',
});
const customId = createId('attempt'); // e.g., "attempt-x9y8z7w6"
```

### Full Mock DB Client

```typescript
const mockDb = {
  select: vi
    .fn()
    .mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn() }),
  }),
  update: vi
    .fn()
    .mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  delete: vi.fn().mockReturnValue({ where: vi.fn() }),
  transaction: vi.fn((fn) => fn({})),
  execute: vi.fn(),
} as unknown as ReturnType<typeof getDb>;
```

### Request Context Injection

```typescript
const mockedGetDb = vi.fn();
const mockedGetRequestContext = vi.fn();
const mockedCleanupDbClient = vi.fn().mockResolvedValue(undefined);

const user = await getUserByAuthId(authUserId, undefined, {
  getRequestContext: mockedGetRequestContext,
  getDb: mockedGetDb,
  cleanupDbClient: mockedCleanupDbClient,
});
```

### Key Imports

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { buildUserFixture } from '@tests/fixtures/users';
import { createTestPlan } from '@tests/fixtures/owned-plan-record';
import { createId } from '@tests/fixtures/ids';
```

---

## Detailed Reference

### 1. Key Types

#### AttemptsDbClient

```typescript
// src/lib/db/queries/types/attempts.types.ts
export type AttemptsDbClient = ReturnType<
  typeof import('@/lib/db/runtime').getDb
>;
```

- Request-scoped database client enforcing Row-Level Security (RLS).
- Callers must call `cleanup()` in a `finally` block.

#### GenerationAttemptRecord

```typescript
export type GenerationAttemptRecord = InferSelectModel<
  DbSchemaModule['generationAttempts']
>;
```

Inferred from the `generationAttempts` schema table — represents a row returned from the database.

#### FinalizeSuccessPersistenceParams

```typescript
export interface FinalizeSuccessPersistenceParams {
  attemptId: string;
  planId: string;
  preparation: AttemptReservation;
  normalizedModules: NormalizedModuleData[];
  normalizationFlags: EffortNormalizationFlags;
  modulesCount: number;
  tasksCount: number;
  durationMs: number;
  metadata: AttemptMetadata;
  finishedAt: Date;
  dbClient: AttemptsDbClient;
}
```

#### NormalizedModuleData / NormalizedTaskData

```typescript
export interface NormalizedModuleData {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  tasks: NormalizedTaskData[];
}

interface NormalizedTaskData {
  title: string;
  description: string | null;
  estimatedMinutes: number;
}
```

---

### 2. Global DB Mock Setup

**File:** `tests/unit/setup.ts`

The project globally mocks `@/lib/db/service-role` to prevent accidental real database access in unit tests. This is a **safety net**, not the primary mocking strategy — prefer injecting mock clients via function parameters (see [test-standards.md §3](./test-standards.md#prefer-dependency-injection-over-module-mocking)).

```typescript
vi.mock('@/lib/db/service-role', () => ({
  client: { end: vi.fn() },
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    execute: vi.fn(),
    query: {
      learningPlans: {
        findFirst: vi.fn(),
      },
    },
  },
  serviceRoleDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));
```

**Why it exists:**

- Prevents `DATABASE_URL` requirement in unit tests
- Catches accidental real database access
- Individual tests override with their own mocks via dependency injection

---

### 3. Vitest Configuration (unit tests)

```typescript
// vitest.config.ts — unit project
{
  test: {
    name: 'unit',
    globals: true,
    environment: 'jsdom',
    isolate: true,
    sequence: { concurrent: true },
    pool: 'threads',
    testTimeout: 20_000,
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
    alias: testAliases,
  },
}
```

Test aliases:

```typescript
const testAliases = {
  '@/lib/auth/server': authServerMockPath,
  '@': srcRoot,
  '@/': path.join(srcRoot, path.sep),
  '@tests': testsRoot,
  '@tests/': path.join(testsRoot, path.sep),
  'next/headers': 'next/headers.js',
} as const;
```

---

### 4. Fixture Patterns

#### User Fixture (`tests/fixtures/users.ts`)

```typescript
export function buildUserFixture(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date();
  return {
    id: `user_${nanoid(12)}`,
    authUserId: `auth_test_${nanoid(12)}`,
    email: `test-${nanoid(12)}@example.test`,
    name: null,
    subscriptionTier: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionPeriodEnd: null,
    monthlyExportCount: 0,
    preferredAiModel: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
```

#### Plan Fixture (`tests/fixtures/owned-plan-record.ts`)

```typescript
export function createTestPlan(
  overrides: Partial<OwnedPlanRecord> = {},
): OwnedPlanRecord {
  return {
    id: createId('plan'),
    userId: createId('user'),
    topic: 'Test Topic',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'reading',
    startDate: null,
    deadlineDate: null,
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
    isQuotaEligible: false,
    finalizedAt: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  } satisfies OwnedPlanRecord;
}
```

#### ID Generation (`tests/fixtures/ids.ts`)

```typescript
export function createId(prefix: string): string {
  return `${prefix}-${nanoid(8)}`;
}
```

---

### 5. Production Code Patterns

#### Type Guard

```typescript
// src/lib/db/queries/helpers/attempts-persistence.ts
const ATTEMPTS_DB_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'transaction',
] as const;

export function isAttemptsDbClient(db: unknown): db is AttemptsDbClient {
  if (db == null || typeof db !== 'object') return false;
  const obj = db as Record<string, unknown>;
  return ATTEMPTS_DB_METHODS.every(
    (method) => typeof obj[method] === 'function',
  );
}
```

#### Transaction Usage

```typescript
export async function persistSuccessfulAttempt(
  params: FinalizeSuccessPersistenceParams,
): Promise<GenerationAttemptRecord> {
  return dbClient.transaction(async (tx) => {
    await tx.delete(modules).where(eq(modules.planId, planId));

    const insertedModuleRows = await tx
      .insert(modules)
      .values(moduleValues)
      .returning({ id: modules.id });

    const [attempt] = await tx
      .update(generationAttempts)
      .set({
        /* ... */
      })
      .where(/* ... */)
      .returning();

    return attempt;
  });
}
```

All DB operations inside a transaction use `tx`, not the outer `dbClient`.

---

### 6. Existing Test Examples

| Test file                               | Pattern                                           |
| --------------------------------------- | ------------------------------------------------- |
| `tests/unit/db/users.queries.spec.ts`   | Drizzle query builder chain mocking               |
| `tests/unit/db/delete-plan.spec.ts`     | SQL capture + `PgDialect.sqlToQuery()` inspection |
| `tests/unit/db/modules-helpers.spec.ts` | Pure function testing (no DB mocks)               |

---

### 7. Complete Test Example

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deletePlan } from '@/lib/db/queries/plans';
import { learningPlans } from '@/lib/db/schema';
import { createTestPlan } from '@tests/fixtures/owned-plan-record';
import { createId } from '@tests/fixtures/ids';
import { PgDialect } from 'drizzle-orm/pg-core';

describe('deletePlan', () => {
  let mockDeleteFn: ReturnType<typeof vi.fn>;
  let mockWhere: ReturnType<typeof vi.fn>;
  let mockReturning: ReturnType<typeof vi.fn>;
  let mockDb: any;
  const pgDialect = new PgDialect();
  const userId = createId('user');
  const planId = createId('plan');

  beforeEach(() => {
    mockReturning = vi.fn();
    mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDeleteFn = vi.fn().mockReturnValue({ where: mockWhere });
    mockDb = { delete: mockDeleteFn };
  });

  it('deletes a plan and captures the SQL', async () => {
    const plan = createTestPlan({
      id: planId,
      userId,
      generationStatus: 'ready',
    });
    mockReturning.mockResolvedValue([{ id: planId }]);

    await deletePlan(planId, userId, mockDb, {
      selectOwnedPlanById: vi.fn().mockResolvedValue(plan),
    });

    expect(mockDeleteFn).toHaveBeenCalledWith(learningPlans);
    expect(mockWhere).toHaveBeenCalled();

    const capturedWhere = mockWhere.mock.calls[0][0];
    const query = pgDialect.sqlToQuery(capturedWhere);
    expect(query.sql).toContain('"learning_plans".');
  });

  it('rejects generating plans', async () => {
    const plan = createTestPlan({
      id: planId,
      userId,
      generationStatus: 'generating',
    });

    const result = await deletePlan(planId, userId, mockDb, {
      selectOwnedPlanById: vi.fn().mockResolvedValue(plan),
    });

    expect(result).toEqual({ success: false, reason: 'currently_generating' });
    expect(mockDeleteFn).not.toHaveBeenCalled();
  });
});
```

---

### 8. Summary

| Principle            | How                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Mock drizzle methods | `vi.fn()` chains: `.mockReturnValue()` for builders, `.mockResolvedValue()` for terminals |
| Inject mocks         | Pass mock `dbClient` to query helpers instead of relying on module mocks                  |
| Validate SQL         | Capture where clauses, inspect via `PgDialect.sqlToQuery()`                               |
| Test data            | `buildUserFixture()`, `createTestPlan()`, `createId()`                                    |
| Safety net           | `tests/unit/setup.ts` globally mocks `@/lib/db/service-role`                              |
| Transactions         | Override `transaction` mock per-test with a `mockTx` that has the operations you need     |

---

## File Locations

| Purpose              | Path                                                 |
| -------------------- | ---------------------------------------------------- |
| Attempt types        | `src/lib/db/queries/types/attempts.types.ts`         |
| Query helper impl    | `src/lib/db/queries/helpers/attempts-persistence.ts` |
| Unit test examples   | `tests/unit/db/*.spec.ts`                            |
| Global DB mock setup | `tests/unit/setup.ts`                                |
| Vitest config        | `vitest.config.ts`                                   |
| User fixtures        | `tests/fixtures/users.ts`                            |
| Plan fixtures        | `tests/fixtures/owned-plan-record.ts`                |
| ID generation        | `tests/fixtures/ids.ts`                              |
