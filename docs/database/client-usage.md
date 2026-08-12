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

- **Use in**: Tests, internal operations, migrations, seeding, **first-user provisioning**, workflow steps, regeneration drain, and other feature-owned server write boundaries after auth checks
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

### First-user provisioning

Authenticated browser roles **cannot INSERT into `users`** after the contract-phase privilege cutover. `ensureUserRecord` still resolves existing rows through the RLS client; missing rows are created only through `provisionUserFromVerifiedAuthSession` (service-role). See [auth-and-data-layer.md](../architecture/auth-and-data-layer.md#first-user-provisioning) and the [deploy cutover](../development/deploy.md).

Do not "fix" local first-login by granting `authenticated` INSERT on `users` — that fails the effective-privilege attestation gate.

### Privilege attestation

Phased migrations run a read-only effective-privilege gate automatically:

```bash
bash scripts/db/attest-effective-privileges.sh
```

The SQL (`scripts/db/attest-effective-privileges.sql`) fails closed when browser roles can bypass RLS, when public app tables lack RLS, when table/column grants exceed allowlists, when `task_progress` loses its allowed writes, or when client roles can reach service-only tables, security-definer functions, the private schema, or unsafe default write grants. Contract phase additionally asserts no `authenticated` INSERT on `users` (including column-level escape hatches). Violations bind to **table OID** so rename/recreate drift does not hide regressions.

Canonical allowlists live under `supabase/privileges/`. Operator summary: [deploy.md](../development/deploy.md).

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

Do not import `@supabase/service-role` from request-layer paths (see `supabase/service-role.ts` and architecture docs). Oxlint enforces this via `eslint/no-restricted-imports` in `.oxlintrc.json` for:

- `src/app/**`
- `src/lib/api/**`
- `src/lib/integrations/**`

## Related Documentation

- `supabase/service-role.ts` - Detailed usage documentation in comments
- `supabase/rls.ts` - RLS client factory documentation
- [docs/testing/test-standards.md](../testing/test-standards.md) - Vitest + Testing Library guidelines
- [docs/testing/db-test-patterns.md](../testing/db-test-patterns.md) - Drizzle query helper test patterns
- [docs/architecture/auth-and-data-layer.md](../architecture/auth-and-data-layer.md) - Auth boundary and provisioning
- [docs/development/deploy.md](../development/deploy.md) - Migration phases and attestation
