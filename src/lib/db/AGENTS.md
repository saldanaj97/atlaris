# Database Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Drizzle ORM + Neon PostgreSQL with Row Level Security (RLS). Two client types: RLS-enforced (default) and service-role (bypass). User-facing policies are explicitly scoped to `authenticated` (never implicit `PUBLIC`).

## Client Selection (CRITICAL)

| Context                    | Client       | Import                            |
| -------------------------- | ------------ | --------------------------------- |
| API routes, server actions | RLS-enforced | `getDb()` from `@/lib/db/runtime` |
| Tests, workers, migrations | Service-role | `db` from `@/lib/db/service-role` |

```typescript
// REQUEST HANDLERS - always use this:
import { getDb } from '@/lib/db/runtime';
const db = getDb();

// TESTS/WORKERS ONLY:
import { db } from '@/lib/db/service-role';
```

**Why?** Service-role bypasses RLS → security vulnerability if used in request handlers.  
ESLint enforces this in `src/app/api/**`, `src/lib/api/**`, `src/lib/integrations/**`.

## Structure

```
db/
├── runtime.ts       # getDb() - context-aware client selector
├── service-role.ts  # Bypasses RLS (tests/workers only)
├── rls.ts           # RLS client factory (authenticated/anonymous)
├── index.ts         # Main exports (RLS clients + schema)
├── schema/
│   ├── tables/      # Table definitions (plans.ts, users.ts, etc.)
│   ├── relations.ts # Drizzle relations
│   └── index.ts     # Barrel export
├── queries/         # Query modules by entity
│   ├── plans.ts     # Plan CRUD
│   ├── users.ts     # User operations
│   ├── attempts.ts  # Generation attempt tracking
│   └── ...
├── enums.ts         # PostgreSQL enum definitions
└── migrations/      # Drizzle migrations
```

## RLS Architecture

```typescript
// rls.ts creates clients that:
// 1. Switch to role: authenticated OR anonymous
// 2. Set session variable: request.jwt.claims = {"sub": "<clerkUserId>"} (or null for anon)
//    via SELECT set_config('request.jwt.claims', '{"sub":"..."}', false)
// 3. Execute queries (RLS filters by request.jwt.claims->>'sub')
// 4. Must call cleanup() when done

const { db, cleanup } = await createAuthenticatedRlsClient(userId);
try {
  // queries here see only user's data
} finally {
  await cleanup(); // CRITICAL: releases connection
}
```

## RLS Policy Rules

- Always include explicit `to` in every `pgPolicy(...)`:
  - `to: 'authenticated'` for user-owned tables and authenticated reads
- Current product posture: no anonymous app-data policies
- Never omit `to` (omitted means `TO PUBLIC` in PostgreSQL)

## Queries Pattern

All query functions accept optional `dbClient` parameter for DI:

```typescript
export async function getPlanById(
  planId: string,
  dbClient: DbClient = getDb()
): Promise<Plan | null> {
  return dbClient.query.learningPlans.findFirst({
    where: eq(learningPlans.id, planId),
  });
}
```

## Key Tables

| Table                 | Purpose                      | Notes                    |
| --------------------- | ---------------------------- | ------------------------ |
| `users`               | User accounts                | `clerk_user_id` for auth |
| `learning_plans`      | Plans with generation status | RLS by `user_id`         |
| `modules`             | Plan sections                | `order` starts at 1      |
| `tasks`               | Learning activities          | `order` starts at 1      |
| `generation_attempts` | AI attempt audit log         | Max 3 per plan           |
| `integration_tokens`  | OAuth tokens                 | Notion, GCal             |

## Commands

```bash
pnpm db:generate   # Generate migrations from schema changes
pnpm db:migrate    # Apply migrations
pnpm db:push       # Push schema directly (dev only)
```

## Anti-Patterns

- Importing `@/lib/db/service-role` in API routes
- Omitting `to` in `pgPolicy(...)` (defaults to insecure `PUBLIC` scope)
- Forgetting `cleanup()` after RLS client use
- Direct SQL without parameterization
- Hardcoding user IDs instead of using session context
