<!-- a5bd4af6-1075-4588-bc10-230ff7e56dea 63526df6-b125-4854-9cf9-99a68abe438f -->

# Big-bang RLS migration for request handlers

### Goal

Move all request-layer DB access to an RLS-enforced client using Supabase + Clerk JWT, remove service-role usage from API routes and helpers, and retain a minimal carve-out for transactional writes that require postgres-js.

### Key changes

- Introduce RLS Drizzle client for requests (`drizzle-orm/supabase-js`).
- Inject request-scoped RLS DB into a shared request context and expose `getDb()` helper that returns the RLS DB in requests or service-role DB in workers.
- Refactor request-used query modules and endpoints to rely on `getDb()` instead of importing `db` directly.
- Keep transactional helpers (e.g., `atomicCheckAndInsertPlan`) on service-role DB, called in a narrow, auditable path.
- Add ESLint rule to forbid importing `@/lib/db/drizzle` in request layers.
- Add tests to prove cross-tenant access is blocked at DB level.

### Files to touch (primary)

- `src/lib/db/rls.ts` (new)
- `src/lib/api/context.ts` (add `db` to context)
- `src/lib/db/runtime.ts` (new: `getDb()`)
- Query modules used by API: `src/lib/db/queries/{users,plans,modules,tasks,resources,schedules}.ts`
- Endpoints: `src/app/api/v1/**`, `src/app/plans/[id]/page.tsx`, `src/lib/api/schedule.ts`, integrations under `src/lib/integrations/**`
- Lint config: `eslint.config.mjs`
- Tests: `tests/integration/api/**`, `tests/integration/rls/**`

### Core snippets (essentials)

RLS client:

```ts
// src/lib/db/rls.ts
import { drizzle } from 'drizzle-orm/supabase-js';
import * as schema from '@/lib/db/schema';
import { createClient } from '@/utils/supabase/server';

export async function getRlsDb() {
  const supabase = await createClient();
  return drizzle(supabase, { schema });
}
```

Runtime DB selection:

```ts
// src/lib/db/runtime.ts
import { db as serviceDb } from '@/lib/db/drizzle';
import { getRequestContext } from '@/lib/api/context';

export function getDb() {
  const ctx = getRequestContext() as { db?: typeof serviceDb } | undefined;
  return ctx?.db ?? serviceDb;
}
```

Inject RLS DB into request context:

```ts
// src/lib/api/auth.ts (inside withAuth)
import { getRlsDb } from '@/lib/db/rls';
...
const requestContext = createRequestContext(req, userId);
requestContext.db = await getRlsDb();
return withRequestContext(requestContext, () => handler({ req, userId, params }));
```

Switch queries to `getDb()`:

```ts
// src/lib/db/queries/plans.ts (pattern)
import { getDb } from '@/lib/db/runtime';
...
export async function getPlanSummariesForUser(userId: string) {
  const db = getDb();
  return db.select()...;
}
```

Add lint guard:

```js
// eslint.config.mjs (excerpt)
{
  files: ['src/app/api/**', 'src/app/**/actions.ts', 'src/lib/api/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      { paths: [{ name: '@/lib/db/drizzle', message: 'Use getDb() / RLS DB in request code' }] },
    ],
  },
}
```

### Carve-out (transactional writes)

- Keep `atomicCheckAndInsertPlan` and any `db.transaction` usage on `@/lib/db/drizzle` (service-role) inside a single, well-documented function.
- Ensure all inputs are caller-scoped (must pass caller `userId`), and add integration tests that simulate mismatched user scenarios.
- Consider a follow-up to move the atomic insert to a worker or SQL function if we want zero service-role in requests.

### Acceptance criteria

- No API file under `src/app/api/**` imports `@/lib/db/drizzle`.
- `getPlanSchedule`, integrations exports/sync, and plan status/data reads execute under RLS with owner checks in WHERE clauses.
- Transactional plan creation remains service-role but is tightly scoped, covered by tests, and documented.
- New tests prove cross-tenant data is not accessible via request routes, even if a developer forgets an explicit check.
- Lint rule fails on any new service-role import in request layers.

### To-dos

- [ ] Create RLS Drizzle client and runtime DB selector (getDb).
- [ ] Inject request-scoped RLS DB via request context in withAuth.
- [ ] Refactor API-used query modules to use getDb() instead of importing db.
- [ ] Update API routes to use getDb() and drop service-role imports.
- [ ] Make src/lib/api/schedule.ts use getDb() and align ownership WHEREs.
- [ ] Switch integrations (Notion/Google) to getDb(); validate ownership preconditions at DB WHERE.
- [ ] Keep atomicCheckAndInsertPlan on service-role; add tests and docs.
- [ ] Add no-restricted-imports rule to block service-role in request layers.
- [ ] Add integration tests enforcing cross-tenant access blocked at DB-level.
- [ ] Document DB usage rules in AGENTS.md/security notes; developer guidance.
