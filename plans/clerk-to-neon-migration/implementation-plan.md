# Clerk → Neon Auth Migration: Complete Implementation Plan

## Overview

Migrate from Clerk to Neon Auth (built on Better Auth v1.4.6) across ~50 files in 8 phases. Zero users exist — no data migration needed. RLS policies are already provider-agnostic at SQL level (`current_setting('request.jwt.claims', true)::json->>'sub'`), so only variable/column names change, not SQL logic.

## Architecture Change

- **Package swap**: `@clerk/nextjs` + `svix` → `@neondatabase/auth`
- **Session model**: Clerk JWT → Neon Auth session (`auth.getSession()` server-side, `authClient.useSession()` client-side)
- **User identity column**: `clerk_user_id` → `auth_user_id`
- **RLS variable**: `clerkSub` → `currentUserId` (SQL fragment unchanged)
- **Middleware**: `clerkMiddleware()` → custom middleware using `getSessionCookie()` from `better-auth/cookies`
- **UI**: Clerk modal components → `<NeonAuthUIProvider>`, `<AuthView>`, `<UserButton>` from `@neondatabase/auth`
- **Webhooks**: DELETE — Neon Auth manages user lifecycle in-database
- **RLS mechanism**: UNCHANGED — `set_config('request.jwt.claims', ...)` pattern stays identical

## Dependency Graph

```
Phase 0 (Notion Removal)
    ↓
Phase 1 (Packages + Env)
    ↓
Phase 2 (Schema Rename)
    ↓
Phase 3 (Auth Server + Middleware + API Auth)
    ↓
    ├──→ Phase 4 (UI Components)       ← PARALLEL
    ├──→ Phase 5 (OAuth Callsites)     ← PARALLEL
    ↓
Phase 6 (Tests) — requires Phases 2-5 complete
    ↓
Phase 7 (Verification)
```

## Other Notes:

- Whenever you see 'x parallel agents', look through through the entire phase because I have grouped and specified which tasks can be completed in parallel using subagents for more efficiency.
- Make sure to mark off the phases that have been completed as they have been completed.
- After finishing an entire phase and marking it as complete, lint, typecheck, build and if all is green, then commit the changes.

---

## PHASE 0(completed): Notion Removal

**Goal**: Remove all Notion code. Pure deletion phase with zero auth-system risk.

### Parallel Group 0A — Delete Files (4 parallel agents)

**Agent 0A-1**: Delete Notion integration directory

- DELETE `src/lib/integrations/notion/client.ts`
- DELETE `src/lib/integrations/notion/factory.ts`
- DELETE `src/lib/integrations/notion/mapper.ts`
- DELETE `src/lib/integrations/notion/types.ts`
- DELETE `src/lib/integrations/notion/sync.ts`

**Agent 0A-2**: Delete Notion API routes

- DELETE `src/app/api/v1/auth/notion/route.ts`
- DELETE `src/app/api/v1/auth/notion/callback/route.ts`
- DELETE `src/app/api/v1/integrations/notion/export/route.ts`

**Agent 0A-3**: Delete Notion test files

- DELETE `tests/mocks/shared/notion-client.shared.ts`
- DELETE `tests/mocks/unit/notion-client.unit.ts`
- DELETE `tests/integration/notion-delta-sync.spec.ts`
- DELETE `tests/integration/notion-export.spec.ts`
- DELETE `tests/integration/notion-oauth.spec.ts`
- DELETE `tests/unit/integrations/notion-mapper.spec.ts`
- DELETE `tests/unit/integrations/notion-client.spec.ts`
- DELETE `tests/e2e/notion-export-flow.spec.ts`

**Agent 0A-4**: Remove `@notionhq/client` from `package.json` dependencies

### Sequential Group 0B — Modify Shared Files (after 0A, 3 parallel agents)

**Agent 0B-1**: `src/lib/db/schema/tables/integrations.ts`

- Remove `notionSyncState` table definition entirely
- Keep `oauthStateTokens`, `integrationTokens`, `googleCalendarSyncState`, `taskCalendarEvents`

**Agent 0B-2**: `src/lib/config/env.ts`

- Delete `notionEnv` export block (`NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_PARENT_PAGE_ID`)

**Agent 0B-3**: `src/lib/db/schema/enums.ts` (if applicable)

- Remove `'notion'` from `integrationProviderEnum` if it exists, keep `'google_calendar'`

### Phase 0 Verification

```bash
pnpm type-check
grep -r "notion\|Notion\|@notionhq" src/ tests/ --include='*.ts' --include='*.tsx' | grep -v node_modules
# Should return zero matches
```

---

## PHASE 1 (completed): Package & Environment Changes

**Goal**: Swap npm packages, update all environment files.
**Dependency**: Phase 0 complete.

### Parallel Group 1A (2 parallel agents)

**Agent 1A-1**: Package changes

- `package.json`: Remove `@clerk/nextjs` (^6.36.10), `svix` (^1.84.1)
- `package.json`: Add `@neondatabase/auth` (latest)
- Run `pnpm install`

**Agent 1A-2**: Environment file updates

- For EACH of `.env.example`, `.env.local`, `.env.test`, `.env.staging`, `.env.prod`:
  - **Remove** all Clerk vars:
    - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
    - `CLERK_SECRET_KEY`
    - `CLERK_WEBHOOK_SECRET`
    - `CLERK_ISSUER`
    - `CLERK_JWKS_URL`
    - `CLERK_JWKS_PUBLIC_KEY`
    - `CLERK_SESSION_TOKEN`
    - `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`
    - `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`
    - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
    - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
    - `DEV_CLERK_USER_ID`
    - `DEV_CLERK_USER_EMAIL`
    - `DEV_CLERK_USER_NAME`
    - `PERF_CLERK_USER_ID`
  - **Remove** all Notion vars:
    - `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_PARENT_PAGE_ID`
  - **Add** Neon Auth vars:
    - `NEON_AUTH_BASE_URL=` (from Neon Console → Branch → Auth → Configuration)
    - `NEON_AUTH_COOKIE_SECRET=` (generate with `openssl rand -base64 32`)
  - **Rename** dev user vars:
    - `DEV_AUTH_USER_ID=` (replaces `DEV_CLERK_USER_ID`)
    - `DEV_AUTH_USER_EMAIL=dev@example.com` (replaces `DEV_CLERK_USER_EMAIL`)
    - `DEV_AUTH_USER_NAME=Dev User` (replaces `DEV_CLERK_USER_NAME`)

### Phase 1 Verification

```bash
pnpm install  # Must succeed with no conflicts
ls node_modules/@neondatabase/auth  # Must exist
ls node_modules/@clerk 2>/dev/null  # Must NOT exist
```

---

## PHASE 2 (completed): Database Schema Rename (Identity Layer)

**Goal**: Rename all `clerk_user_id` references to `auth_user_id`, rename `clerkSub` variable to `currentUserId`, delete webhook events table, update queries, generate migration.
**Dependency**: Phase 1 complete.

### Step 2.1a — Common.ts First (must be first, blocks other schema files)

**Agent 2-1**: `src/lib/db/schema/tables/common.ts`

```typescript
// BEFORE:
export const clerkSub = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;

// AFTER:
export const currentUserId = sql`current_setting('request.jwt.claims', true)::json->>'sub'`;
```

- Rename variable `clerkSub` → `currentUserId`
- SQL fragment stays IDENTICAL
- Update comment from "Clerk JWT subject helper" to "Auth user ID from JWT claims"

### Step 2.1b — Schema Table Files (5 parallel agents, after 2.1a)

**Agent 2-2**: `src/lib/db/schema/tables/users.ts`

- Change import: `clerkSub` → `currentUserId`
- Rename column definition: `clerkUserId: text('clerk_user_id').notNull().unique()` → `authUserId: text('auth_user_id').notNull().unique()`
- In all 3 RLS policies (`users_select_own`, `users_insert_own`, `users_update_own`):
  - `table.clerkUserId` → `table.authUserId`
  - `${clerkSub}` → `${currentUserId}`

**Agent 2-3**: `src/lib/db/schema/tables/integrations.ts`

- In `oauthStateTokens` table:
  - `clerkUserId: text('clerk_user_id').notNull()` → `authUserId: text('auth_user_id').notNull()`
- In 3 RLS policies (`oauth_state_tokens_insert`, `oauth_state_tokens_select`, `oauth_state_tokens_delete`):
  - `table.clerkUserId` → `table.authUserId`
  - The inline SQL `(current_setting('request.jwt.claims', true)::json->>'sub')` stays unchanged

**Agent 2-4**: `src/lib/db/schema/tables/jobs.ts`

- Change import: `clerkSub` → `currentUserId`
- In RLS policies: `${users.clerkUserId} = ${clerkSub}` → `${users.authUserId} = ${currentUserId}`

**Agent 2-5**: `src/lib/db/schema/policy-helpers.ts`

- Change import: `clerkSub` → `currentUserId`
- Replace all `${clerkSub}` → `${currentUserId}`
- Replace all `${users.clerkUserId}` → `${users.authUserId}`

**Agent 2-6**: Delete + Update schema index

- DELETE `src/lib/db/schema/tables/clerk.ts` (drops `clerkWebhookEvents` table)
- In `src/lib/db/schema/index.ts`: Remove `export * from './tables/clerk'`

### Step 2.2 — Query Layer (after 2.1b)

**Agent 2-7**: `src/lib/db/queries/users.ts`

```typescript
// BEFORE → AFTER:
getUserByClerkId(clerkUserId: string)  →  getUserByAuthId(authUserId: string)
  // where: eq(users.clerkUserId, clerkUserId)  →  eq(users.authUserId, authUserId)

createUser({ clerkUserId, email, name })  →  createUser({ authUserId, email, name })

deleteUserByClerkId(clerkUserId: string)  →  deleteUserByAuthId(authUserId: string)
  // where: eq(users.clerkUserId, clerkUserId)  →  eq(users.authUserId, authUserId)
```

### Step 2.3 — Config Layer (parallel with 2.2)

**Agent 2-8**: `src/lib/config/env.ts`

- DELETE `clerkWebhookEnv` export entirely
- Rename `devClerkEnv` → `devAuthEnv`:
  - `DEV_CLERK_USER_ID` → `DEV_AUTH_USER_ID`
  - `DEV_CLERK_USER_EMAIL` → `DEV_AUTH_USER_EMAIL`
  - `DEV_CLERK_USER_NAME` → `DEV_AUTH_USER_NAME`
- ADD new `neonAuthEnv` export:

```typescript
export const neonAuthEnv = {
  get baseUrl() {
    return getServerRequired('NEON_AUTH_BASE_URL');
  },
  get cookieSecret() {
    return getServerRequired('NEON_AUTH_COOKIE_SECRET');
  },
} as const;
```

### Step 2.4 — Seed File (after 2.2 and 2.3)

**Agent 2-9**: `src/lib/db/seed.ts`

- Change import: `devClerkEnv` → `devAuthEnv`
- Rename all local vars: `devClerkUserId` → `devAuthUserId`
- Change all `clerkUserId:` field references → `authUserId:`
- Change all `schema.users.clerkUserId` → `schema.users.authUserId`

### Step 2.5 — Generate Migration (after all above)

**Agent 2-10**: Run migration generation

```bash
pnpm db:generate
```

- Verify generated SQL contains `ALTER TABLE users RENAME COLUMN clerk_user_id TO auth_user_id`
- Verify generated SQL contains `ALTER TABLE oauth_state_tokens RENAME COLUMN clerk_user_id TO auth_user_id`
- Verify generated SQL drops `clerk_webhook_events` table
- Verify it does NOT drop-and-recreate (which would lose data in non-empty tables)

### Phase 2 Verification

```bash
pnpm type-check
grep -r "clerkSub\|clerkUserId\|clerk_user_id\|getUserByClerkId\|deleteUserByClerkId\|devClerkEnv\|clerkWebhookEnv" src/lib/db/ src/lib/config/ --include='*.ts'
# Should return zero matches
```

---

## PHASE 3 (completed): Auth Server + Middleware + API Auth Rewrite

**Goal**: Create Neon Auth server/client instances, rewrite middleware, rewrite all auth API functions, update RLS client, delete webhook route.
**Dependency**: Phase 2 complete.

### Step 3.1 — Create Auth Infrastructure (4 parallel agents)

**Agent 3-1**: CREATE `src/lib/auth/server.ts`

```typescript
import { createNeonAuth } from '@neondatabase/auth/next/server';
import { neonAuthEnv } from '@/lib/config/env';

export const auth = createNeonAuth({
  baseUrl: neonAuthEnv.baseUrl,
  cookies: {
    secret: neonAuthEnv.cookieSecret,
  },
});
```

**Agent 3-2**: CREATE `src/lib/auth/client.ts`

```typescript
'use client';

import { createAuthClient } from '@neondatabase/auth/next';

export const authClient = createAuthClient();
```

**Agent 3-3**: CREATE `src/app/api/auth/[...path]/route.ts`

```typescript
import { auth } from '@/lib/auth/server';

export const { GET, POST } = auth.handler();
```

**Agent 3-4**: CREATE `src/app/auth/[path]/page.tsx`

```tsx
import { AuthView } from '@neondatabase/auth/react';

export const dynamicParams = false;

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}): Promise<React.ReactElement> {
  const { path } = await params;

  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthView path={path} />
    </main>
  );
}
```

### Step 3.2 — Rewrite Middleware (after 3.1)

**Agent 3-5**: `src/middleware.ts` — COMPLETE REWRITE

Replace `clerkMiddleware` with custom middleware using `getSessionCookie` from `better-auth/cookies`. Preserve: maintenance mode logic, correlation ID logic, Stripe webhook bypass, protected route matching.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { appEnv } from '@/lib/config/env';

const protectedPrefixes = ['/dashboard', '/api', '/plans', '/account'];

function isProtectedRoute(pathname: string): boolean {
  // Auth API routes must NOT be protected (they handle sign-in/sign-up)
  if (pathname.startsWith('/api/auth/')) return false;
  // Stripe webhooks bypass all checks
  if (pathname.startsWith('/api/v1/stripe/webhook')) return false;
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CORRELATION_ID_MAX_LENGTH = 64;

const sanitizeCorrelationId = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CORRELATION_ID_MAX_LENGTH) return null;
  if (!CORRELATION_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
};

const getCorrelationId = (request: NextRequest): string => {
  const headerCorrelationId = request.headers.get('x-correlation-id');
  const sanitized = sanitizeCorrelationId(headerCorrelationId);
  return sanitized ?? crypto.randomUUID();
};

const withCorrelationId = (
  request: NextRequest,
  response: NextResponse
): NextResponse => {
  const correlationId = getCorrelationId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', correlationId);
  response.headers.set('x-correlation-id', correlationId);
  return response;
};

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Stripe webhooks bypass all checks including maintenance mode
  if (pathname.startsWith('/api/v1/stripe/webhook')) {
    const response = NextResponse.next();
    return withCorrelationId(request, response);
  }

  // Maintenance mode
  const isMaintenanceMode = appEnv.maintenanceMode;
  const isMaintenancePage = pathname === '/maintenance';

  if (isMaintenanceMode && !isMaintenancePage) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }
  if (!isMaintenanceMode && isMaintenancePage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Auth protection
  if (isProtectedRoute(pathname)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/auth/sign-in', request.url));
    }
  }

  const response = NextResponse.next();
  return withCorrelationId(request, response);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### Step 3.3 — Rewrite API Auth Layer + RLS Client + Delete Webhook (3 parallel agents, after 3.1)

**Agent 3-6**: `src/lib/api/auth.ts` — COMPLETE REWRITE

Replace all 8 exported functions. Key changes:

```typescript
import { appEnv, devAuthEnv } from '@/lib/config/env';
import { createRequestContext, withRequestContext } from './context';
import { AuthError } from './errors';
import {
  checkUserRateLimit,
  getUserRateLimitHeaders,
  type UserRateLimitCategory,
} from './user-rate-limit';
import {
  createUser,
  getUserByAuthId,
  type DbUser,
} from '@/lib/db/queries/users';

/**
 * Returns the effective auth user id for the current request.
 * In Vitest: reads DEV_AUTH_USER_ID env var.
 * In dev: prefers DEV_AUTH_USER_ID when present.
 * In production: calls auth.getSession() from Neon Auth.
 */
export async function getEffectiveAuthUserId(): Promise<string | null> {
  if (appEnv.vitestWorkerId) {
    const devUserId = devAuthEnv.userId;
    return devUserId || null;
  }

  if (appEnv.isDevelopment) {
    const devUserId = devAuthEnv.userId;
    if (devUserId !== undefined) {
      return devUserId || null;
    }
  }

  const { auth } = await import('@/lib/auth/server');
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Returns the auth user id from the actual session, ignoring dev overrides.
 * For security-sensitive flows (e.g. OAuth callbacks).
 */
export async function getAuthUserId(): Promise<string | null> {
  const { auth } = await import('@/lib/auth/server');
  const { data: session } = await auth.getSession();
  return session?.user?.id ?? null;
}

export async function requireUser(): Promise<string> {
  const userId = await getEffectiveAuthUserId();
  if (!userId) throw new AuthError();
  return userId;
}

async function ensureUserRecord(authUserId: string): Promise<DbUser> {
  const existing = await getUserByAuthId(authUserId);
  if (existing) return existing;

  const { auth } = await import('@/lib/auth/server');
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    throw new AuthError('Auth user data unavailable.');
  }

  const email = session.user.email;
  if (!email) {
    throw new AuthError('Auth user must have an email address.');
  }

  const created = await createUser({
    authUserId,
    email,
    name: session.user.name || undefined,
  });

  if (!created) {
    throw new AuthError('Failed to provision user record.');
  }

  return created;
}

export async function getOrCreateCurrentUserRecord(): Promise<DbUser | null> {
  const userId = await getEffectiveAuthUserId();
  if (!userId) return null;
  return ensureUserRecord(userId);
}

export async function requireCurrentUserRecord(): Promise<DbUser> {
  const userId = await requireUser();
  return ensureUserRecord(userId);
}

// withAuth — change user.clerkUserId → user.authUserId
export function withAuth(handler: Handler): PlainHandler {
  return async (req, routeContext?) => {
    const params = routeContext?.params ? await routeContext.params : {};

    if (appEnv.isTest) {
      const user = await requireCurrentUserRecord();
      const userId = user.authUserId;
      const requestContext = createRequestContext(req, userId);
      return await withRequestContext(requestContext, () =>
        handler({ req, userId, params })
      );
    }

    const user = await requireCurrentUserRecord();
    const userId = user.authUserId;

    const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
    const { db: rlsDb, cleanup } = await createAuthenticatedRlsClient(userId);
    const requestContext = createRequestContext(req, userId, rlsDb, cleanup);

    try {
      return await withRequestContext(requestContext, () =>
        handler({ req, userId, params })
      );
    } finally {
      await cleanup();
    }
  };
}

// withAuthAndRateLimit, withErrorBoundary, compose, withRateLimit — UNCHANGED structurally
```

- Delete exports: `getEffectiveClerkUserId`, `getClerkAuthUserId`
- Add exports: `getEffectiveAuthUserId`, `getAuthUserId`
- Keep: `requireUser`, `getOrCreateCurrentUserRecord`, `requireCurrentUserRecord`, `withAuth`, `withAuthAndRateLimit`, `withErrorBoundary`, `compose`, `withRateLimit`

**Agent 3-7**: `src/lib/db/rls.ts` — Parameter rename only

- Rename parameter: `clerkUserId: string` → `authUserId: string` in `createAuthenticatedRlsClient()`
- Rename local: `const jwtClaims = JSON.stringify({ sub: clerkUserId })` → `{ sub: authUserId }`
- Update JSDoc: "Clerk user ID" → "authenticated user ID"
- Update logger: `{ error, clerkUserId }` → `{ error, authUserId }`
- Update example in JSDoc: `getEffectiveClerkUserId()` → `getEffectiveAuthUserId()`
- The `set_config` call stays IDENTICAL

**Agent 3-8**: DELETE `src/app/api/webhooks/clerk/route.ts`

- Delete entire file — Neon Auth manages user lifecycle in-database

### Phase 3 Verification

```bash
pnpm type-check
grep -r "@clerk/nextjs\|clerkMiddleware\|getEffectiveClerkUserId\|getClerkAuthUserId" src/ --include='*.ts' --include='*.tsx'
# Should return zero matches in src/ (tests not yet updated)
```

---

## PHASE 4: UI Components & Layout (PARALLEL WITH PHASE 5)

**Goal**: Replace all Clerk UI components with Neon Auth equivalents.
**Dependency**: Phase 3 complete.

### Parallel Group 4A (5 parallel agents)

**Agent 4-1**: `src/app/layout.tsx`

- Remove: `import { ClerkProvider } from '@clerk/nextjs'`
- Remove: `<ClerkProvider afterSignOutUrl="/landing">` wrapper
- Add: `import { NeonAuthUIProvider } from '@neondatabase/auth/react'`
- Add: `import { authClient } from '@/lib/auth/client'`
- Wrap children with:

```tsx
<NeonAuthUIProvider
  authClient={authClient}
  redirectTo="/dashboard"
  emailOTP
  social={{ providers: ['google'] }}
>
```

- Add CSS import in `globals.css`: `@import "@neondatabase/auth/ui/tailwind";`
- Update metadata description to remove Notion reference

**Agent 4-2**: RENAME + REWRITE `src/components/shared/ClerkAuthControls.tsx` → `src/components/shared/AuthControls.tsx`

- Remove all Clerk imports (`SignedIn`, `SignedOut`, `SignInButton`, `SignUpButton`, `UserButton`)
- This is a `'use client'` component
- Import `authClient` from `@/lib/auth/client`
- Import `UserButton` from `@neondatabase/auth/react`
- Use `authClient.useSession()` to check auth state
- If session exists: render `<UserButton />` + tier badge
- If no session: render Link-based sign-in/sign-up buttons pointing to `/auth/sign-in` and `/auth/sign-up`

**Agent 4-3**: `src/components/shared/SiteHeader.tsx`

- Remove: `import { auth } from '@clerk/nextjs/server'`
- Remove: `import { getUserByClerkId } from '@/lib/db/queries/users'`
- Add: `import { auth } from '@/lib/auth/server'`
- Add: `import { getUserByAuthId } from '@/lib/db/queries/users'`
- Change session check:

```typescript
// BEFORE:
const { userId: clerkUserId } = await auth();
const navItems = clerkUserId ? authenticatedNavItems : unauthenticatedNavItems;
if (clerkUserId) {
  const user = await getUserByClerkId(clerkUserId);
  tier = user?.subscriptionTier;
}

// AFTER:
const { data: session } = await auth.getSession();
const authUserId = session?.user?.id;
const navItems = authUserId ? authenticatedNavItems : unauthenticatedNavItems;
if (authUserId) {
  const user = await getUserByAuthId(authUserId);
  tier = user?.subscriptionTier;
}
```

**Agent 4-4**: `src/components/shared/nav/DesktopHeader.tsx`

- Remove: `import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'`
- This component receives `tier` as a prop from SiteHeader (server component), so it doesn't need auth session directly
- Replace `<SignedIn>` / `<SignedOut>` wrappers with a prop-based approach:
  - SiteHeader already passes `tier` — add an `isAuthenticated` prop
  - Or: make this a client component and use `authClient.useSession()`
- Replace `<SignInButton mode="modal">` with `<Link href="/auth/sign-in">`
- Import `AuthControls` instead of `ClerkAuthControls`

**Agent 4-5**: `src/components/shared/nav/MobileHeader.tsx`

- Same pattern as DesktopHeader
- Replace `import ClerkAuthControls` → `import AuthControls`
- Replace Clerk component references with new auth-based rendering

### Phase 4 Verification

```bash
pnpm type-check
pnpm build
grep -r "@clerk/nextjs\|ClerkProvider\|ClerkAuthControls\|SignedIn\|SignedOut\|SignInButton\|SignUpButton" src/ --include='*.ts' --include='*.tsx'
# Should return zero matches
```

---

## PHASE 5: OAuth & Integration Callsites (PARALLEL WITH PHASE 4)

**Goal**: Update all remaining files that reference Clerk auth functions or user IDs.
**Dependency**: Phase 3 complete (auth functions renamed and available).

### Parallel Group 5A (7 parallel agents)

**Agent 5-1**: `src/app/api/v1/auth/google/route.ts`

- Remove: `import { auth } from '@clerk/nextjs/server'`
- Add: `import { auth } from '@/lib/auth/server'`
- Change: `const { userId } = await auth()` → `const { data: session } = await auth.getSession(); const userId = session?.user?.id;`

**Agent 5-2**: `src/app/api/v1/auth/google/callback/route.ts`

- Replace: `import { getClerkAuthUserId } from '@/lib/api/auth'` → `import { getAuthUserId } from '@/lib/api/auth'`
- Rename: all `clerkUserId` / `stateClerkUserId` local vars → `authUserId` / `stateAuthUserId`
- Change: `getClerkAuthUserId()` → `getAuthUserId()`
- Change: `eq(users.clerkUserId, ...)` → `eq(users.authUserId, ...)`

**Agent 5-3**: `src/app/plans/actions.ts`

- Replace: `import { getEffectiveClerkUserId } from '@/lib/api/auth'` → `import { getEffectiveAuthUserId } from '@/lib/api/auth'`
- Replace: `import { getUserByClerkId } from '@/lib/db/queries/users'` → `import { getUserByAuthId } from '@/lib/db/queries/users'`
- Change: `const clerkUserId = await getEffectiveClerkUserId()` → `const authUserId = await getEffectiveAuthUserId()`
- Change: `getUserByClerkId(clerkUserId)` → `getUserByAuthId(authUserId)`

**Agent 5-4**: `src/lib/integrations/oauth-state.ts`

- Rename parameter: `clerkUserId: string` → `authUserId: string` in `generateAndStoreOAuthStateToken()`
- Change: `store.issue({ clerkUserId, provider })` → `store.issue({ authUserId, provider })`

**Agent 5-5**: `src/lib/integrations/oauth-state-store.ts`

- In `issue()`: rename destructuring `{ clerkUserId, provider }` → `{ authUserId, provider }`
- In `issue()`: change insert values `clerkUserId` → `authUserId`
- In `consume()`: change `.returning({ clerkUserId: oauthStateTokens.clerkUserId })` → `.returning({ authUserId: oauthStateTokens.authUserId })`
- In `consume()`: change return `deleted?.clerkUserId ?? null` → `deleted?.authUserId ?? null`

**Agent 5-6**: `src/lib/integrations/oauth-state.types.ts` (if exists as separate file)

- Rename `clerkUserId` → `authUserId` in `IssueOAuthStateParams` interface
- Update JSDoc

**Agent 5-7**: `src/lib/db/seed.ts` (if not already done in Phase 2)

- Verify all `devClerkEnv` → `devAuthEnv` references are updated
- Verify all `clerkUserId` → `authUserId` field references are updated

### Phase 5 Verification

```bash
pnpm type-check
grep -r "clerkUserId\|clerk_user_id\|getEffectiveClerkUserId\|getClerkAuthUserId\|getUserByClerkId\|devClerkEnv" src/ --include='*.ts' --include='*.tsx'
# Should return zero matches
```

---

## PHASE 6: Tests

**Goal**: Update all test infrastructure and test files.
**Dependency**: Phases 2-5 ALL complete.

### Parallel Group 6A — Test Infrastructure (6 parallel agents)

**Agent 6-1**: `tests/helpers/auth.ts`

```typescript
// BEFORE:
setTestUser(clerkUserId: string) → process.env.DEV_CLERK_USER_ID = clerkUserId
clearTestUser() → delete process.env.DEV_CLERK_USER_ID

// AFTER:
setTestUser(authUserId: string) → process.env.DEV_AUTH_USER_ID = authUserId
clearTestUser() → delete process.env.DEV_AUTH_USER_ID
```

**Agent 6-2**: `tests/helpers/rls.ts`

- Rename parameter: `clerkUserId` → `authUserId` in `createRlsDbForUser()`
- Update JSDoc and comments

**Agent 6-3**: `tests/helpers/db.ts`

- In `ensureUser()`: rename `clerkUserId` → `authUserId` in type signature, destructuring, and insert values
- Remove any `notionSyncState` truncation if not already removed in Phase 0

**Agent 6-4**: `tests/helpers/testIds.ts` (if exists)

- Rename `buildTestClerkUserId` → `buildTestAuthUserId`
- Change prefix from `clerk_test_` → `auth_test_`
- Rename function params from `clerkUserId` → `authUserId`

**Agent 6-5**: `tests/unit/components/AuthControls.spec.tsx` — COMPLETE REWRITE

- Remove all `@clerk/nextjs` mocks
- Mock `@/lib/auth/client` instead (mock `authClient.useSession()`)
- Test new `AuthControls` component (renamed from `ClerkAuthControls`)
- Keep tier badge tests
- Test authenticated vs unauthenticated rendering

**Agent 6-6**: `tests/setup/test-env.ts`

- Add Neon Auth env defaults if needed (`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`)

### Sequential Group 6B — Bulk Test File Updates (after 6A)

**Agent 6-7**: Bulk search-and-replace across ALL remaining test files (~78 files)

Global replacements:

- `ensureUser({ clerkUserId:` → `ensureUser({ authUserId:`
- `buildTestClerkUserId(` → `buildTestAuthUserId(`
- `user.clerkUserId` → `user.authUserId`
- `clerkUserId:` (in object literals) → `authUserId:`
- `DEV_CLERK_USER_ID` → `DEV_AUTH_USER_ID`
- `import { ... } from '@clerk/nextjs/server'` → remove (should not exist in test files after Phase 3)
- `getUserByClerkId` → `getUserByAuthId`
- `getEffectiveClerkUserId` → `getEffectiveAuthUserId`
- `getClerkAuthUserId` → `getAuthUserId`

### Phase 6 Verification

```bash
pnpm test                    # Unit tests pass
pnpm test:integration        # Integration tests pass
grep -r "clerk\|Clerk\|CLERK" tests/ --include='*.ts' --include='*.tsx' | grep -v node_modules
# Should return zero matches
```

---

## PHASE 7: Final Verification & Cleanup

**Goal**: Confirm zero Clerk/Notion/Svix references remain. Complete build and test suite passes.
**Dependency**: All prior phases complete.

### Step 7.1 — Global Cleanup Check

```bash
# Search for ANY remaining references
grep -ri "clerk\|svix\|@notionhq\|notionEnv\|notionSyncState\|clerkSub" \
  src/ tests/ --include='*.ts' --include='*.tsx' --include='*.json' \
  | grep -v node_modules | grep -v '.next'
# MUST return zero matches
```

### Step 7.2 — Update AGENTS.md

- `AGENTS.md`: Change "Clerk" → "Neon Auth" in Stack description
- `src/lib/db/AGENTS.md`: Update auth references
- `src/lib/integrations/AGENTS.md`: Remove Notion references
- `tests/AGENTS.md`: Update test helper references

### Step 7.3 — Full Build & Test

```bash
pnpm lint
pnpm type-check
pnpm build
pnpm test
pnpm test:integration
RUN_RLS_TESTS=1 pnpm exec vitest run --project security tests/security/
```

### Step 7.4 — Manual Smoke Test Checklist

1. Visit `/auth/sign-in` — renders Neon Auth sign-in form
2. Sign up with email — creates user in `neon_auth.user` AND app `users` table
3. Sign in with Google — works through Neon Auth social login
4. After sign-in, navigate to `/dashboard` — sees authenticated nav
5. Create a learning plan — plan generation works with RLS
6. Connect Google Calendar — OAuth flow uses new auth user ID
7. Sign out — redirects to landing page
8. Visit `/dashboard` while signed out — redirects to `/auth/sign-in`

### Step 7.5 — Security Audit

1. Confirm RLS policies enforce user isolation (user A cannot see user B's data)
2. Confirm anonymous users get zero rows from all user-scoped tables
3. Confirm the database connection uses SET ROLE to non-BYPASSRLS role
4. Confirm no Clerk secrets or tokens remain in any env files
5. Confirm `clerk_webhook_events` table is dropped

---

## Risk Areas & Mitigations

| Risk                                                                                            | Mitigation                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `auth.getSession()` return type differs from expected `{ data: { user: { id, email, name } } }` | Verify actual type after `@neondatabase/auth` install in Phase 1; adjust Phase 3 accordingly                                     |
| Middleware: `auth.middleware()` vs custom middleware approach                                   | Plan uses `getSessionCookie()` from `better-auth/cookies` for maximum control; preserves maintenance mode + correlation ID logic |
| `ensureUserRecord` pattern: session may not have email/name populated                           | Neon Auth (Better Auth) stores email and name in session; verify after first sign-up                                             |
| Drizzle migration generates DROP+CREATE instead of RENAME COLUMN                                | Inspect generated SQL before applying; manually edit migration if needed                                                         |
| `globals.css` Neon Auth UI styles conflict with existing Tailwind                               | Test UI rendering after adding `@import "@neondatabase/auth/ui/tailwind"`                                                        |
| SiteHeader is a server component but DesktopHeader/MobileHeader are client                      | Pass `isAuthenticated` boolean prop down from server to client, or use `authClient.useSession()` in client components            |

---

## File Change Summary

| Action        | Count | Files                                                                                                     |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| DELETE        | ~25   | Notion files (18), clerk.ts, webhook route, ClerkAuthControls.tsx (replaced)                              |
| CREATE        | 4     | `lib/auth/server.ts`, `lib/auth/client.ts`, `app/api/auth/[...path]/route.ts`, `app/auth/[path]/page.tsx` |
| REWRITE       | 4     | `middleware.ts`, `lib/api/auth.ts`, `ClerkAuthControls.tsx` → `AuthControls.tsx`, `AuthControls.spec.tsx` |
| RENAME/UPDATE | ~25+  | Schema files, query files, config, seed, OAuth routes, integration files, env files, AGENTS.md            |
| TEST UPDATES  | ~78   | Bulk rename `clerkUserId` → `authUserId` across all test files                                            |
| MIGRATION     | 1     | New migration: rename columns + drop table                                                                |
