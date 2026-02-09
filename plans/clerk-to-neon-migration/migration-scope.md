# Complete Migration Scope: Clerk → Neon Auth

## What We're Dealing With

The audit reveals 6 layers of Clerk integration (plus Notion removal), plus a critical architectural decision about the database connection model. Total scope: ~50 files across application code, schema, middleware, UI, integrations, and tests.

---

## User Preferences & Constraints

- User confirmed zero users exist — no user data migration needed
- Notion integration is being fully removed — not integrated for users yet, will be re-implemented later post-migration. Only Google OAuth + email/password for auth.
- User is comfortable with Neon Auth's beta status
- Security is the top priority — user explicitly said "This needs to be very very safe" regarding the Data API vs serverless driver decision
- The user wants to revert commit `ee639e9` on develop before starting fresh
- User liked the layered format (Layer 1-6 tables + Recommended Migration Order numbered list) and wants it preserved for their planning agent

---

## Architectural Decision: Serverless Driver with `set_config`, NOT the Data API

### Why — security-first reasoning:

1. **Your plan generation pipeline** (`attempts.ts`) runs multi-table atomic transactions (delete modules → insert modules → insert tasks → insert attempt → all in one tx). The Data API is PostgREST and cannot do multi-table transactions. You'd need to split your architecture.

2. **The Data API defaults CORS to `*`** — an extra attack surface you'd need to lock down.

3. **The Data API exposes tables as REST endpoints** — any schema reconnaissance leaks table names, column names, and relationships to anyone who can reach the endpoint.

4. **The serverless driver with `set_config` inside a transaction** is the documented Neon Auth pattern for Drizzle ORM. JWT claims are transaction-scoped (`true` parameter), so they can't leak between requests even with connection pooling.

5. **The key security improvement** over your current approach: connect as a non-BYPASSRLS role (e.g., `authenticated` directly), not as `neondb_owner` with `SET ROLE`. This eliminates the "app server holds owner credentials" risk. Neon Auth + serverless driver can use a connection string for a role that has RLS enforced by default.

**Net result:** You keep Drizzle ORM, keep your query builder, keep multi-table transactions, but gain Neon Auth's in-database identity model and branch-aware auth for preview environments.

---

## Layer 1: Database Identity (Deepest)

| File                                       | What's Clerk-Specific                                                                                                                                       | Migration Action                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema/tables/common.ts`       | `clerkSub` variable name (SQL uses `current_setting('request.jwt.claims', true)::json->>'sub'`)                                                             | Rename to `authSub` or `currentUserId`; SQL fragment stays the same                                      |
| `src/lib/db/schema/tables/users.ts`        | `clerk_user_id` column                                                                                                                                      | Rename to `auth_user_id`; update all references                                                          |
| `src/lib/db/schema/tables/integrations.ts` | `clerk_user_id` column on `oauth_state_tokens` table + inline RLS policies referencing `clerkSub`                                                           | Rename column; update RLS policy SQL references                                                          |
| `src/lib/db/schema/tables/clerk.ts`        | `clerk_webhook_events` table                                                                                                                                | Delete table and file entirely                                                                           |
| All RLS policy helpers in schema           | Variable names reference `clerkSub`, but SQL uses `current_setting('request.jwt.claims', true)::json->>'sub'`                                               | Rename variables; SQL fragments stay the same                                                            |
| `src/lib/db/rls.ts`                        | `createAuthenticatedRlsClient(clerkUserId)` with `SET ROLE authenticated` + `set_config('request.jwt.claims', ...)` pattern, clerk-user-id parameter naming | Rewrite: pass Neon Auth session user ID instead of Clerk user ID; connect as non-BYPASSRLS role directly |
| `src/lib/db/runtime.ts`                    | Returns RLS client from `AsyncLocalStorage`                                                                                                                 | Update to work with new RLS client pattern                                                               |
| `src/lib/db/queries/users.ts`              | `getUserByClerkId()`, `deleteUserByClerkId()`, `createUser({ clerkUserId })`                                                                                | Rename/refactor; `deleteUserByClerkId` becomes unnecessary (Neon Auth manages user lifecycle)            |
| `src/lib/db/queries/attempts.ts`           | Uses service-role DB (already correct for server-side operations)                                                                                           | No change needed                                                                                         |
| Migrations (0000–0008)                     | Existing migrations created Clerk-era schema; no pg_session_jwt migration exists (was reverted)                                                             | Write new migration for Neon Auth setup (role config, schema references)                                 |
| `src/lib/config/env.ts`                    | `clerkWebhookEnv` (webhook secret), `devClerkEnv` (dev user ID/email/name)                                                                                  | Delete `clerkWebhookEnv`; replace `devClerkEnv` with `neonAuthEnv` (base URL + cookie secret)            |
| `src/lib/db/seed.ts`                       | `devClerkEnv.userId` for deterministic dev user                                                                                                             | Replace with Neon Auth user ID format                                                                    |

### Key Insight

The RLS policies are already provider-agnostic at the SQL level — they all use `current_setting('request.jwt.claims', true)::json->>'sub'` (not `auth.user_id()`). This is the same `set_config` pattern that Neon Auth uses. The `rls.ts` client already calls `set_config('request.jwt.claims', ...)` to populate claims. No RLS policy SQL needs to change — only variable names (e.g., `clerkSub` → `currentUserId`) and the source of the user ID (Clerk JWT → Neon Auth session).

---

## Layer 2: Auth Middleware & API Layer

| File                                  | What's Clerk-Specific                                                                                                                                                                                                                                                                              | Migration Action                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/middleware.ts`                   | `clerkMiddleware()`, `createRouteMatcher`, `ClerkMiddlewareAuth`, Clerk CSP directives                                                                                                                                                                                                             | Complete rewrite — use Neon Auth middleware (`auth.middleware()`)                                                                                                                             |
| `src/lib/api/auth.ts`                 | `getEffectiveClerkUserId()`, `getClerkAuthUserId()`, `requireUser()`, `ensureUserRecord()` (calls Clerk's `currentUser()` API), `getOrCreateCurrentUserRecord()`, `requireCurrentUserRecord()`, `withAuth()`, `withAuthAndRateLimit()` — all depend on Clerk's `auth()` or `currentUser()` imports | Complete rewrite — replace all functions with Neon Auth session handling. `ensureUserRecord()` simplifies dramatically because user data lives in `neon_auth.user` table in the same database |
| `src/app/api/webhooks/clerk/route.ts` | Entire file — Clerk webhook handler + Svix signature verification + idempotency table                                                                                                                                                                                                              | Delete — Neon Auth manages user lifecycle in-database; no webhooks needed                                                                                                                     |
| `src/app/api/auth/[...path]/route.ts` | Does not exist yet                                                                                                                                                                                                                                                                                 | Create — Neon Auth catch-all route handler (`export const { GET, POST } = auth.handler()`)                                                                                                    |

---

## Layer 3: UI Components & Providers

| File                                          | What's Clerk-Specific                                             | Migration Action                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`                          | `<ClerkProvider afterSignOutUrl="/landing">` wrapping entire app  | Remove; replace with Neon Auth provider if needed, or handle at middleware level               |
| `src/components/shared/ClerkAuthControls.tsx` | `SignInButton`, `SignUpButton`, `UserButton` from `@clerk/nextjs` | Complete rewrite — build custom sign-in/sign-up forms using Neon Auth SDK (Better Auth client) |
| `src/components/shared/nav/DesktopHeader.tsx` | `SignedIn`, `SignedOut`, `SignInButton` from `@clerk/nextjs`      | Replace with session checks via Neon Auth (`auth.getSession()` server-side, or client hook)    |
| `src/app/landing/layout.tsx`                  | References `ClerkProvider` in comments                            | Update comments                                                                                |
| Auth pages (sign-in, sign-up)                 | Currently handled by Clerk's modal/redirect UI                    | Create custom pages at `/auth/sign-in`, `/auth/sign-up` with email + Google OAuth forms        |

---

## Layer 4: OAuth Integrations & Dependencies

| File                                        | What's Clerk-Specific                                                                    | Migration Action                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Google Calendar OAuth routes                | Call `getClerkAuthUserId()` for user identity during OAuth callback                      | Switch to `auth.getSession()` from Neon Auth                                     |
| `src/app/plans/actions.ts`                  | Calls `getEffectiveClerkUserId()` and `getUserByClerkId()` directly (not via `withAuth`) | Replace with Neon Auth session calls; update user lookup to use new auth user ID |
| `src/lib/integrations/oauth-state.ts`       | `generateAndStoreOAuthStateToken(clerkUserId, ...)` parameter naming                     | Rename parameter to `authUserId`                                                 |
| `src/lib/integrations/oauth-state-store.ts` | Stores `clerkUserId` in `oauthStateTokens` table; references Clerk user ID throughout    | Rename references; column rename handled in Layer 1                              |
| `package.json`                              | `@clerk/nextjs` dependency                                                               | Remove                                                                           |
| `package.json`                              | `svix` dependency (Clerk webhook verification)                                           | Remove                                                                           |
| `package.json`                              | Add `@neondatabase/auth`                                                                 | Add                                                                              |

---

## Layer 5: Tests

| File                                          | What's Clerk-Specific                                                                     | Migration Action                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `tests/helpers/rls.ts`                        | RLS test helpers using `set_config` pattern with Clerk user IDs                           | Update user ID format for Neon Auth        |
| `tests/helpers/db.ts`                         | May reference Clerk user IDs in test setup                                                | Update to use Neon Auth user ID format     |
| `tests/helpers/auth.ts`                       | `setTestUser(clerkUserId)` sets `DEV_CLERK_USER_ID` env var; `clearTestUser()` removes it | Rewrite to set Neon Auth session identity  |
| `tests/security/rls.policies.spec.ts`         | Tests using `clerkUserId` field in test data and Clerk identity model                     | Rewrite test identity setup; rename fields |
| `tests/unit/components/AuthControls.spec.tsx` | Mocks `@clerk/nextjs` components (`SignInButton`, `SignUpButton`, `UserButton`)           | Rewrite for new auth UI components         |
| `tests/setup/test-env.ts`                     | No Clerk env defaults (has Google OAuth + encryption defaults only)                       | Add Neon Auth env defaults if needed       |
| `tests/fixtures/`                             | Any user factories using `clerkUserId` field                                              | Rename field to match new schema           |

---

## Layer 6: Notion Integration Removal

Notion is not yet integrated for users and adds unnecessary complexity during the auth migration. Remove all Notion code now; re-implement later using Neon Auth's session model if needed.

| File                                                 | What It Contains                                                                                                | Migration Action                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/integrations/notion/client.ts`              | `NotionClient` class wrapping `@notionhq/client` with rate limiting + retries                                   | Delete                                                         |
| `src/lib/integrations/notion/sync.ts`                | `exportPlanToNotion()`, `deltaSyncPlanToNotion()` with SHA-256 content hashing                                  | Delete                                                         |
| `src/lib/integrations/notion/types.ts`               | Re-exports Notion API types from `@notionhq/client`                                                             | Delete                                                         |
| `src/lib/integrations/notion/factory.ts`             | `createNotionIntegrationClient()` factory for DI                                                                | Delete                                                         |
| `src/lib/integrations/notion/mapper.ts`              | Maps learning plans to Notion block structures                                                                  | Delete                                                         |
| `src/app/api/v1/auth/notion/route.ts`                | Notion OAuth initiation — generates state token, redirects to Notion authorize URL                              | Delete                                                         |
| `src/app/api/v1/auth/notion/callback/route.ts`       | Notion OAuth callback — validates state, exchanges code for token, stores encrypted tokens                      | Delete                                                         |
| `src/app/api/v1/integrations/notion/export/route.ts` | POST endpoint for exporting plans to Notion                                                                     | Delete                                                         |
| `src/lib/db/schema/tables/integrations.ts`           | `notionSyncState` table (plan-to-Notion page mapping + sync hash)                                               | Remove `notionSyncState` table from file                       |
| `src/lib/config/env.ts`                              | `notionEnv` config (`NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_PARENT_PAGE_ID`) | Delete `notionEnv` block                                       |
| `package.json`                                       | `@notionhq/client` dependency                                                                                   | Remove                                                         |
| `tests/mocks/shared/notion-client.shared.ts`         | Shared Notion client mock                                                                                       | Delete                                                         |
| `tests/mocks/unit/notion-client.unit.ts`             | Unit test Notion client mock                                                                                    | Delete                                                         |
| `tests/integration/notion-oauth.spec.ts`             | Notion OAuth flow integration tests                                                                             | Delete                                                         |
| `tests/integration/notion-export.spec.ts`            | Notion export integration tests                                                                                 | Delete                                                         |
| `tests/integration/notion-delta-sync.spec.ts`        | Notion delta sync integration tests                                                                             | Delete                                                         |
| `tests/unit/integrations/notion-client.spec.ts`      | Notion client unit tests                                                                                        | Delete                                                         |
| `tests/unit/integrations/notion-mapper.spec.ts`      | Notion mapper unit tests                                                                                        | Delete                                                         |
| `tests/e2e/notion-export-flow.spec.ts`               | End-to-end Notion export flow test                                                                              | Delete                                                         |
| `src/lib/db/schema/enums.ts` (if applicable)         | `integrationProviderEnum` — may include `'notion'` as a value                                                   | Remove `'notion'` value if safe; keep enum for Google Calendar |

---

## Recommended Migration Order

1. ~~**Revert the pg_session_jwt commit on develop** (`git revert ee639e9`) — clean slate~~ ✅ **COMPLETED**
2. ~~**New branch from develop** (e.g., `feature/neon-auth-migration`)~~ ✅ **COMPLETED**
3. **Phase 1: Notion removal** — Delete all Notion integration files (`src/lib/integrations/notion/`), Notion API routes, `notionSyncState` table from schema, `notionEnv` from `env.ts`, `@notionhq/client` from `package.json`, and all Notion test files. Remove `'notion'` from `integrationProviderEnum` if safe.
4. **Phase 2: Infrastructure** — Install `@neondatabase/auth`, remove `@clerk/nextjs` + `svix`, add env vars (`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`), enable Neon Auth in Neon Console
5. **Phase 3: Database schema** — Rename `clerk_user_id` → `auth_user_id` (in `users.ts` + `integrations.ts`), delete `clerk.ts` schema file (drops `clerk_webhook_events` table), rename `clerkSub` → `currentUserId` in `common.ts`, write new migration, run `pnpm db:generate`
6. **Phase 4: Auth server setup** — Create `src/lib/auth/server.ts` with `createNeonAuth()`, create `src/app/api/auth/[...path]/route.ts` catch-all handler
7. **Phase 5: RLS client rewrite** — Rewrite `rls.ts`: rename `clerkUserId` parameters, pass Neon Auth session user ID; connect as non-BYPASSRLS role directly (already uses `set_config` pattern)
8. **Phase 6: Middleware** — Replace `clerkMiddleware()` with `auth.middleware()` in `src/middleware.ts`
9. **Phase 7: API auth layer** — Rewrite `src/lib/api/auth.ts`: replace all 8 exported functions (`getEffectiveClerkUserId`, `getClerkAuthUserId`, `requireUser`, `ensureUserRecord`, `getOrCreateCurrentUserRecord`, `requireCurrentUserRecord`, `withAuth`, `withAuthAndRateLimit`) with Neon Auth session equivalents. Update `src/app/plans/actions.ts` which calls `getEffectiveClerkUserId()` and `getUserByClerkId()` directly.
10. **Phase 8: UI** — Build custom sign-in/sign-up pages, replace `ClerkAuthControls.tsx` + `DesktopHeader.tsx` Clerk components, remove `<ClerkProvider>` from layout
11. **Phase 9: Cleanup** — Delete Clerk webhook route, update `AGENTS.md` files, clean up env files (`.env.example`: remove `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `DEV_CLERK_USER_ID`, `PERF_CLERK_USER_ID`; `.env.local`/`.env.test`/`.env.prod`/`.env.staging`: remove `CLERK_ISSUER`, `CLERK_JWKS_URL`; also remove Notion env vars from `.env.local`). Rename `oauth-state.ts`/`oauth-state-store.ts` Clerk references.
12. **Phase 10: Tests** — Rewrite `tests/helpers/auth.ts` (`setTestUser`/`clearTestUser`), update `tests/helpers/rls.ts` user ID format, rewrite `tests/security/rls.policies.spec.ts` identity setup, rewrite `tests/unit/components/AuthControls.spec.tsx` for new auth UI, update user factories
13. **Phase 11: Verify** — `pnpm lint && pnpm type-check && pnpm build`, run unit tests, run integration tests, manual smoke test of sign-up → plan generation → calendar sync flow

---

## Open Considerations (Not Blocking, But Track These)

| Item                                             | Detail                                                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User data access pattern**                     | With Neon Auth, user profile data (name, email) lives in `neon_auth."user"`. You can JOIN against it directly, or copy to your own users table on first login. Decide which pattern to use.                         |
| **The users table — keep or merge?**             | Your current users table has app-specific fields (subscription tier, preferences). You'll likely keep it but link via `auth_user_id` → `neon_auth.user.id` instead of Clerk ID.                                     |
| **Connection model change**                      | Current: connect as owner → `SET ROLE authenticated`. New: connect directly as a non-BYPASSRLS role. This means a separate connection string / database role for the app. Verify Neon supports this with your plan. |
| **Google OAuth for calendar sync vs. for login** | These are separate OAuth flows. Neon Auth handles Google OAuth for login. Your Google Calendar integration uses separate OAuth tokens stored in `integration_tokens`. These are independent and shouldn't conflict. |
| **Beta stability**                               | Neon Auth is beta. Pin your `@neondatabase/auth` version and test against specific Neon API versions. Have a rollback plan.                                                                                         |
| **Env files across environments**                | Clerk and Notion env vars exist in `.env.example`, `.env.local`, `.env.test`, `.env.prod`, `.env.staging`. Phase 9 cleanup must cover all of them — don't just clean `.env.example` and miss the rest.              |
