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

Do not import `@supabase/service-role` from request-layer paths (see `supabase/service-role.ts` and architecture docs). Oxlint enforces this via `eslint/no-restricted-imports` in `.oxlintrc.json` for:

- `src/app/**`
- `src/lib/api/**`
- `src/lib/integrations/**`

## Privilege model and attestation

RLS policies are necessary but not sufficient: browser roles (`anon`, `authenticated`) must also have **effective** table/column/function privileges that match the allowlists. After each phased migration (`expand` or `contract`), CI runs a read-only attestation gate.

### Canonical allowlists

TypeScript modules under `supabase/privileges/` are the app-side source of expected client grants. Keep them aligned with migration SQL and with `scripts/db/attest-effective-privileges.sql`:

| Module | Purpose |
| ------ | ------- |
| `authenticated-table-privileges.ts` | Server-owned write tables that `authenticated` must **not** INSERT/UPDATE/DELETE |
| `users-authenticated-update-columns.ts` | Allowed `users` UPDATE columns |
| `task-progress-authenticated-update-columns.ts` | Allowed `task_progress` UPDATE columns |
| `user-preferences-authenticated-columns.ts` | Preference / email settings INSERT+UPDATE columns |

Security tests in `tests/security/effective-privileges-attestation.spec.ts` assert the SQL gate still references these lists.

### Running attestation

```bash
# Default phase is contract (post-cutover posture)
bash scripts/db/attest-effective-privileges.sh

# Match the migration phase you just applied
bash scripts/db/attest-effective-privileges.sh expand
bash scripts/db/attest-effective-privileges.sh contract
```

`scripts/db/run-phased-migrations.sh` calls the script with the current phase after a successful expand or contract. Manual re-runs need a linked Supabase CLI target (`supabase db query --linked`).

### What the gate checks

`scripts/db/attest-effective-privileges.sql` fails closed when any check finds a violation (first match raises). High-level checks:

1. `anon` / `authenticated` exist and do **not** bypass RLS.
2. No permissive policies target `PUBLIC` or `anon` on app data.
3. Every public application table has RLS enabled.
4. `anon` has no table/column DML privileges on public app tables.
5. `authenticated` cannot write server-owned tables listed in `AUTHENTICATED_SERVER_OWNED_WRITE_TABLES`.
6. Service-only tables (`clerk_webhook_events`, `clerk_webhook_event_claims`, `email_notification_delivery_runs`, `email_notification_deliveries`, and `legacy_stripe_entitlement_archive` when present) have no client grants.
7. Column grants on `users`, `task_progress`, and preference tables match allowlists (expand may temporarily allow legacy preference columns on `users` until contract).
8. **Contract phase only:** `authenticated` must not have `INSERT` (table or column) on `public.users`.
9. Client roles cannot `EXECUTE` security-definer functions in `public` / `private`, and cannot `USAGE` the `private` schema.
10. Default ACLs must not grant client INSERT/UPDATE/DELETE on public tables.

Privilege lookups bind to table **oid** (not name alone) so rename/recreate edge cases still fail correctly. Repair migrations such as `20260811100700_revoke_anon_unsafe_table_privileges.sql` and `20260811100800_revoke_security_definer_execute.sql` exist to bring environments back in line when attestation fails.

Operator deploy notes: [deploy.md](../development/deploy.md). Pipeline wiring: [pipeline-and-deployment-strategy.md](../ci-cd/pipeline-and-deployment-strategy.md).

## Related Documentation

- `supabase/service-role.ts` - Detailed usage documentation in comments
- `supabase/rls.ts` - RLS client factory documentation
- [test-standards.md](../testing/test-standards.md) - Test pyramid and client guidance
- [db-test-patterns.md](../testing/db-test-patterns.md) - Drizzle / RLS test patterns
