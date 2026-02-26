# Authentication & Data Layer Architecture

How authentication, authorization, and database access work together to enforce tenant isolation.

## Overview

Every database query in a user-facing context runs through a **three-layer security chain**:

1. **Auth Layer** — Resolves the authenticated user from the Neon Auth session cookie
2. **RLS Client** — Creates a Postgres connection scoped to that user (`SET ROLE authenticated` + `request.jwt.claims`)
3. **RLS Policies** — Postgres row-level security policies filter every query by the user's `sub` claim

If any layer fails, access is denied. The system is **fail-closed** — missing context throws an error, never falls back to an unrestricted client.

## Auth Wrappers

Three wrappers establish authenticated DB context for the three server-side consumer types:

| Consumer Type     | Wrapper                          | Callback Signature                     | Use When                     |
| ----------------- | -------------------------------- | -------------------------------------- | ---------------------------- |
| API Routes        | `withAuth(handler)`              | `(ctx: { req, userId, user, params })` | Route handlers in `app/api/` |
| Server Actions    | `withServerActionContext(fn)`    | `(user, rlsDb) => Promise<T>`          | `'use server'` functions     |
| Server Components | `withServerComponentContext(fn)` | `(user) => Promise<T>`                 | Async server components      |

All three are exported from `@/lib/api/auth` and share a single private helper (`runWithAuthenticatedContext`) that:

1. Creates an RLS client via `createAuthenticatedRlsClient(authUserId)`
2. Wraps execution in `withRequestContext` so `getDb()` returns the RLS client
3. Calls `ensureUserRecord(authUserId)` to resolve or provision the DB user
4. Guarantees cleanup of the RLS connection in a `finally` block

### When to use which

```typescript
// API Route (app/api/v1/plans/route.ts)
export const GET = withAuth(async ({ user }) => {
  const plans = await getPlanSummariesForUser(user.id);
  return Response.json(plans);
});

// Server Action (app/plans/[id]/actions.ts)
export async function getPlanForPage(planId: string) {
  const result = await withServerActionContext(async (user) => {
    return getLearningPlanDetail(planId, user.id);
  });
  if (!result) return unauthorized();
  return result;
}

// Server Component (components/shared/SiteHeader.tsx)
const tier = await withServerComponentContext(
  async (user) => user.subscriptionTier
);
```

### Return behavior

- `withAuth`: Throws `AuthError` if unauthenticated (returns 401 via `withErrorBoundary`)
- `withServerActionContext`: Returns `null` if unauthenticated (caller decides how to handle)
- `withServerComponentContext`: Returns `null` if unauthenticated (caller decides how to handle)

## User ID Resolution

There are two user IDs in the system:

| ID           | Type     | Source        | Example                             | Used For                     |
| ------------ | -------- | ------------- | ----------------------------------- | ---------------------------- |
| `authUserId` | External | Neon Auth     | `9f3a7b2e-...` (auth provider UUID) | RLS claims, session identity |
| `user.id`    | Internal | `users` table | `a1b2c3d4-...` (app DB UUID)        | Foreign keys, ownership      |

**Critical**: Ownership queries must use `user.id` (internal), not `authUserId` (external). The wrappers resolve both — `ctx.userId` / callback's first arg gives you the full `DbUser` object with both IDs.

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
withAuth / withServerActionContext / withServerComponentContext
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
| Workers / background jobs    | `getServiceDbForWorker()`          | No user session exists                                 |
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

4. **Service-role usage is restricted.** ESLint blocks `@/lib/db/service-role` imports in `src/app/api/**`, `src/lib/api/**`, `src/lib/integrations/**`. The `deleteUserByAuthId` function throws if called inside request context.

5. **RLS connections are isolated.** Each request gets a dedicated non-pooled connection (`max: 1`). Session variables cannot leak between requests. Cleanup is guaranteed via `finally`.

## Anti-Patterns

| Don't                                             | Do Instead                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Call `getDb()` outside an auth wrapper            | Use `withAuth`, `withServerActionContext`, or `withServerComponentContext` |
| Pass user ID from request body to query functions | Always use `ctx.user.id` from the auth wrapper callback                    |
| Import `@/lib/db/service-role` in API routes      | Use `getDb()` which returns the RLS-scoped client                          |
| Create manual RLS clients in server actions       | Use `withServerActionContext` which handles lifecycle                      |
| Skip `cleanup()` on RLS clients                   | Use the wrappers — they handle cleanup in `finally`                        |
| Use `getEffectiveAuthUserId()` for security flows | Use `getAuthUserId()` which ignores dev overrides                          |

## Code Locations

| Component             | File                            |
| --------------------- | ------------------------------- |
| Auth wrappers         | `src/lib/api/auth.ts`           |
| Request context       | `src/lib/api/context.ts`        |
| RLS client factory    | `src/lib/db/rls.ts`             |
| DB client resolver    | `src/lib/db/runtime.ts`         |
| Service-role client   | `src/lib/db/service-role.ts`    |
| Neon Auth config      | `src/lib/auth/server.ts`        |
| Subscription gates    | `src/lib/api/gates.ts`          |
| RLS policies (schema) | `src/lib/db/schema/tables/*.ts` |
| Query modules         | `src/lib/db/queries/*.ts`       |
