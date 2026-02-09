# Database Client Usage

**CRITICAL for security**: Understanding when to use each database client.

## Available Clients

### 1. RLS-Enforced Client (Default)

```typescript
import { getDb } from '@/lib/db/runtime';
```

- **Use in**: API routes, server actions, request handlers
- **Behavior**: Respects Row Level Security, enforces tenant isolation
- **Runtime model**: `src/lib/db/rls.ts` switches role (`SET ROLE authenticated|anonymous`) and sets `request.jwt.claims`
- **Location**: `src/lib/db/runtime.ts`

### 2. Service-Role Client (Bypass)

```typescript
import { db } from '@/lib/db/service-role';
```

- **Use in**: Tests, internal operations, migrations, seeding
- **Behavior**: Bypasses RLS completely
- **Location**: `src/lib/db/service-role.ts`

## Usage Rules

### Policy Scope Rules (RLS)

- Every user-facing `pgPolicy(...)` must include explicit `to`
- Current scope policy:
  - `to: 'authenticated'` for user-owned CRUD + authenticated reads
  - No anonymous app-data policies unless a new public feature is explicitly approved
- Omitted `to` is forbidden because PostgreSQL defaults to `TO PUBLIC`

### Request Handlers (API Routes, Server Actions)

**MUST use `getDb()` from `@/lib/db/runtime`.**

```typescript
// ✅ Correct
import { getDb } from '@/lib/db/runtime';

export async function GET() {
  const db = getDb();
  const plans = await db.select().from(learningPlans);
  // ...
}
```

```typescript
// ❌ Wrong - bypasses security
import { db } from '@/lib/db/service-role';

export async function GET() {
  const plans = await db.select().from(learningPlans);
  // ...
}
```

### Tests

**Use `db` from `@/lib/db/service-role` for business logic tests.**

```typescript
import { db } from '@/lib/db/service-role';

describe('Plan creation', () => {
  it('creates a plan', async () => {
    // Service role for test setup/cleanup
    await db.insert(learningPlans).values({ ... });
  });
});
```

For RLS policy tests, use RLS clients and run:

```bash
RUN_RLS_TESTS=1 pnpm exec vitest run --project security tests/security/
```

### Transactional Writes

Functions like `atomicCheckAndInsertPlan` may use service-role DB for atomicity, but **must validate all inputs are caller-scoped**.

## ESLint Enforcement

Importing `@/lib/db/service-role` in request layers is blocked by lint rules:

- `src/app/api/**`
- `src/lib/api/**`
- `src/lib/integrations/**`

## Related Documentation

- `src/lib/db/service-role.ts` - Detailed usage documentation in comments
- `src/lib/db/rls.ts` - RLS client factory documentation
- [docs/testing/testing.md](../testing/testing.md) - Testing with different clients
