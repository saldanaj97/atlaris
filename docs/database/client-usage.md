# Database Client Usage

**CRITICAL for security**: Understanding when to use each database client.

## Available Clients

### 1. RLS-Enforced Client (Default)

```typescript
import { getDb } from '@supabase/runtime';
```

- **Use in**: API routes, server actions, request handlers
- **Behavior**: Respects Row Level Security, enforces tenant isolation
- **Runtime model**: `supabase/rls.ts` switches role (`SET ROLE authenticated|anon`) and sets `request.jwt.claims`
- **Location**: `supabase/runtime.ts`

### 2. Service-Role Client (Bypass)

```typescript
import { db } from '@supabase/service-role';
```

- **Use in**: Tests, internal operations, migrations, seeding
- **Behavior**: Bypasses RLS completely
- **Location**: `supabase/service-role.ts`

## Usage Rules

### Policy Scope Rules (RLS)

- Every user-facing `pgPolicy(...)` must include explicit `to`
- Current scope policy:
  - `to: 'authenticated'` for user-owned CRUD + authenticated reads
  - No anonymous app-data policies unless a new public feature is explicitly approved
- Omitted `to` is forbidden because PostgreSQL defaults to `TO PUBLIC`

### Request Handlers (API Routes, Server Actions)

**MUST use `getDb()` from `@supabase/runtime`.**

```typescript
// ✅ Correct
import { getDb } from '@supabase/runtime';

export async function GET() {
  const db = getDb();
  const plans = await db.select().from(learningPlans);
  // ...
}
```

```typescript
// ❌ Wrong - bypasses security
import { db } from '@supabase/service-role';

export async function GET() {
  const plans = await db.select().from(learningPlans);
  // ...
}
```

### Tests

**Use `db` from `@supabase/service-role` for business logic tests.**

```typescript
import { db } from '@supabase/service-role';

describe('Plan creation', () => {
  it('creates a plan', async () => {
    // Service role for test setup/cleanup
    await db.insert(learningPlans).values({ ... });
  });
});
```

For RLS policy tests, use RLS clients and run (Docker required for Testcontainers):

```bash
pnpm test:security
# or: pnpm vitest run --project security tests/security/
```

### Transactional Writes

Functions like `atomicCheckAndInsertPlan` may use service-role DB for atomicity, but **must validate all inputs are caller-scoped**.

## Lint enforcement

Do not import `@supabase/service-role` from request-layer paths (see `supabase/service-role.ts` and architecture docs). Automated import boundaries were previously enforced with ESLint; use Oxlint plus review until equivalent rules land in `.oxlintrc.json`.

- `src/app/api/**`
- `src/lib/api/**`
- `src/lib/integrations/**`

## Related Documentation

- `supabase/service-role.ts` - Detailed usage documentation in comments
- `supabase/rls.ts` - RLS client factory documentation
- [docs/testing/testing.md](../testing/testing.md) - Testing with different clients
