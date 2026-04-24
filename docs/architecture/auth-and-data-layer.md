# Authentication & Data Layer Architecture

How authentication, authorization, and database access work together to enforce tenant isolation.

**Last Updated:** March 2026

## Overview

Every database query in a user-facing context runs through a **three-layer security chain**:

1. **Auth Layer** — Resolves the authenticated user from the Neon Auth session cookie
2. **RLS Client** — Creates a Postgres connection scoped to that user (`SET ROLE authenticated` + `request.jwt.claims`)
3. **RLS Policies** — Postgres row-level security policies filter every query by the user's `sub` claim

If any layer fails, access is denied. The system is **fail-closed** — missing context throws an error, never falls back to an unrestricted client.

## Auth boundary (default for server work)

**Preferred:** `requestBoundary` from `@/lib/api/request-boundary` — one object with three entry points:

| Consumer Type     | API                              | Callback receives `RequestScope` or `RouteScope`   | Use when                          |
| ----------------- | -------------------------------- | -------------------------------------------------- | --------------------------------- |
| API routes        | `requestBoundary.route(...)`     | `{ req, params, actor, db, ... }`                  | Handlers in `app/api/`            |
| Server components | `requestBoundary.component(...)` | `{ actor, db, ... }`                               | Async server components           |
| Server actions    | `requestBoundary.action(...)`    | `{ actor, db, ... }`                               | `'use server'` functions          |

`requestBoundary.route` is built on `withAuth` + rate-limit options. `requestBoundary.component` and `requestBoundary.action` call `withServerComponentContext` and `withServerActionContext` internally — those two functions are **compatibility shims** for call sites that have not moved to `requestBoundary` yet; new code should use `requestBoundary.component` / `requestBoundary.action` instead.

**API routes** still use `withAuth(handler)` directly (or via `requestBoundary.route`); that pattern stays primary for `app/api/`.

## Lower-level auth helpers (`@/lib/api/auth`)

`withServerComponentContext` and `withServerActionContext` still establish authenticated DB context; they sit below `requestBoundary` and share a single private helper (`runWithAuthenticatedContext`) that:

1. Creates an RLS client via `createAuthenticatedRlsClient(authUserId)`
2. Wraps execution in `withRequestContext` so `getDb()` returns the RLS client
3. Calls `ensureUserRecord(authUserId)` to resolve or provision the DB user
4. Guarantees cleanup of the RLS connection in a `finally` block

### When to use which

```typescript
// API route — withAuth, or requestBoundary.route (see request-boundary.ts)
export const GET = withAuth(async ({ user }) => {
  const plans = await getPlanSummariesForUser(user.id);
  return json(plans);
});

// Server action (preferred) — requestBoundary.action
import { requestBoundary } from '@/lib/api/request-boundary';
export async function getPlanForPage(planId: string) {
  const result = await requestBoundary.action(async ({ actor }) => {
    return getLearningPlanDetail(planId, actor.id);
  });
  if (result === null) return unauthorized();
  return result;
}

// Server component (preferred) — requestBoundary.component
import { requestBoundary } from '@/lib/api/request-boundary';
const tier = await requestBoundary.component(async ({ actor }) => actor.subscriptionTier);
```

`withServerActionContext` / `withServerComponentContext` are still valid for existing code; prefer `requestBoundary.action` / `requestBoundary.component` in new or refactored files.

`getEffectiveAuthUserId()` is for **redirect-only** identity checks (e.g. “is anyone logged in?”) where you do not need RLS-backed `getDb()`. Anything that runs queries with tenant data must go through a full auth boundary above.

### Return behavior

- `withAuth` (and `requestBoundary.route` built on it): Throws `AuthError` if unauthenticated (returns 401 via `withErrorBoundary` when so wrapped)
- `withServerActionContext` and `requestBoundary.action`: Return `null` if unauthenticated (caller decides how to handle)
- `withServerComponentContext` and `requestBoundary.component`: Return `null` if unauthenticated (caller decides how to handle)

When a server action boundary wraps an action whose successful return type can be `void` / `undefined`, use an explicit `result === null` check for auth failure rather than a generic falsy check.

## User ID Resolution

There are two user IDs in the system:

| ID           | Type     | Source        | Example                             | Used For                     |
| ------------ | -------- | ------------- | ----------------------------------- | ---------------------------- |
| `authUserId` | External | Neon Auth     | `9f3a7b2e-...` (auth provider UUID) | RLS claims, session identity |
| `user.id`    | Internal | `users` table | `a1b2c3d4-...` (app DB UUID)        | Foreign keys, ownership      |

**Critical**: Ownership queries must use `user.id` (internal), not `authUserId` (external). In API routes, `ctx.userId` is the external auth user id while `ctx.user` is the full `DbUser`. In server actions/components, the callback receives the full `DbUser`.

### How auth user ID is obtained

```
getEffectiveAuthUserId()
├── Test mode (VITEST_WORKER_ID set) → DEV_AUTH_USER_ID env var
├── Development (NODE_ENV=development) → DEV_AUTH_USER_ID if set, else session
└── Production → auth.getSession() → session.user.id (Neon Auth cookie)
```

The `DEV_AUTH_USER_ID` override is **impossible in production** — it's gated by `NODE_ENV` which is a process-level environment variable, not a request parameter.

For security-sensitive flows (OAuth callbacks), use `getAuthUserId()` instead — it always reads the real session, ignoring dev overrides.

## RLS Enforcement Chain

```
Request arrives
    │
    ▼
withAuth / requestBoundary (or withServerActionContext / withServerComponentContext)
    │
    ├── getEffectiveAuthUserId() → auth user ID from session cookie
    │
    ├── createAuthenticatedRlsClient(authUserId)
    │   ├── Opens dedicated Postgres connection (non-pooled, max: 1)
    │   ├── SET ROLE authenticated          ← drops BYPASSRLS privilege
    │   ├── SET search_path = public
    │   └── set_config('request.jwt.claims', '{"sub":"<authUserId>"}', false)
    │                                        ↑ parameterized, no injection risk
    │
    ├── withRequestContext({ db: rlsDb })   ← getDb() now returns this client
    │
    ├── ensureUserRecord(authUserId)        ← get or create DB user record
    │
    ├── fn(user, rlsDb)                     ← your code runs here
    │
    └── finally: cleanup()                  ← closes the dedicated connection
```

### What the Postgres policies check

Every RLS policy in `src/lib/db/schema/tables/` extracts the user from session claims:

```sql
-- Helper used by all policies (defined in schema/tables/common.ts)
current_setting('request.jwt.claims', true)::json->>'sub'
```

Policies check ownership either directly (`user_id = currentUserId`) or through chains (`task → module → plan → user`).

## Database Client Selection

| Context                      | What to use                        | Why                                                    |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Inside auth wrappers         | `getDb()` or the `rlsDb` callback  | Returns request-scoped RLS client                      |
| Query function default param | `getDb()` (optional `dbClient` DI) | Works in all contexts via request context              |
| Tests / integration tests    | `db` from `@/lib/db/service-role`  | Bypasses RLS for test data setup                       |
| Workers / background jobs    | `db` from `@/lib/db/service-role`  | No user session exists                                 |
| Stripe webhooks              | `db` from `@/lib/db/service-role`  | System-originated, no user session, signature-verified |

### Fail-closed design

```typescript
// runtime.ts — getDb()
if (appEnv.isTest) return serviceDb; // Tests bypass RLS
const ctx = getRequestContext();
if (ctx?.db) return ctx.db; // RLS client from wrapper
throw new MissingRequestDbContextError(); // No fallback — fail hard
```

## Security Guarantees

1. **No user ID from client input.** Every route gets `user.id` from the auth wrapper, never from request params/body/headers.

2. **Double-layered access control.** Application queries filter by `user.id` AND Postgres RLS policies enforce the same filter at the database level. Even if app code has a bug, the database blocks cross-tenant access.

3. **Dev overrides cannot leak to production.** `DEV_AUTH_USER_ID` is gated by `NODE_ENV` (process-level). `STRIPE_WEBHOOK_DEV_MODE` has a startup assertion that crashes the process if enabled outside dev/test.

4. **Service-role usage is restricted.** Do not import `@/lib/db/service-role` from `src/app/api/**`, `src/lib/api/**`, or `src/lib/integrations/**` (enforce via architecture review and Biome).

5. **RLS connections are isolated.** Each request gets a dedicated non-pooled connection (`max: 1`). Session variables cannot leak between requests. Cleanup is guaranteed via `finally`.

## Anti-Patterns

| Don't                                             | Do Instead                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Call `getDb()` outside an auth wrapper            | Use `withAuth` or `requestBoundary` (or the legacy shims)                  |
| Pass user ID from request body to query functions | Always use `ctx.user` / `actor` from the boundary callback                 |
| Import `@/lib/db/service-role` in API routes      | Use `getDb()` which returns the RLS-scoped client                          |
| Create manual RLS clients in server actions       | Use `requestBoundary.action` or `withServerActionContext` for lifecycle   |
| Skip `cleanup()` on RLS clients                   | Use the wrappers — they handle cleanup in `finally`                        |
| Use `getEffectiveAuthUserId()` for security flows or DB work | Use a full auth boundary; `getAuthUserId()` for OAuth flows ignoring dev overrides |

## Code Locations

| Component             | File                            |
| --------------------- | ------------------------------- |
| Auth + legacy shims   | `src/lib/api/auth.ts`           |
| Request boundary      | `src/lib/api/request-boundary.ts` |
| Request context       | `src/lib/api/context.ts`        |
| RLS client factory    | `src/lib/db/rls.ts`             |
| DB client resolver    | `src/lib/db/runtime.ts`         |
| Service-role client   | `src/lib/db/service-role.ts`    |
| Neon Auth config      | `src/lib/auth/server.ts`        |
| Quota / usage logic   | `src/lib/stripe/usage.ts`       |
| RLS policies (schema) | `src/lib/db/schema/tables/*.ts` |
| Query modules         | `src/lib/db/queries/*.ts`       |
