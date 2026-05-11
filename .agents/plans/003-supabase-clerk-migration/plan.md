# Supabase Postgres + Clerk Auth

## Goal

Document the completed Atlaris database/auth architecture: Supabase-hosted Postgres, Supabase local development, Drizzle-managed migrations, PostgreSQL RLS, and Clerk Auth.

## Current State

Important live-tree anchors:

- `src/proxy.ts` delegates protected route validation to Clerk middleware.
- `src/lib/auth/server.ts` wraps Clerk server helpers for session and user reads.
- `src/app/layout.tsx`, `src/app/(auth)/auth/sign-in/[[...sign-in]]/page.tsx`, `src/app/(auth)/auth/sign-up/[[...sign-up]]/page.tsx`, `src/components/shared/AuthControls.tsx`, and `src/app/globals.css` use Clerk UI/components and app-owned global styles.
- `src/lib/api/auth.ts` resolves session identity, provisions `users`, and starts request-scoped RLS contexts.
- `src/lib/db/rls.ts` opens a dedicated Postgres connection, runs `SET ROLE authenticated` or `SET ROLE anon`, and sets `request.jwt.claims.sub`.
- `src/lib/db/schema/tables/common.ts` defines the current RLS subject as `current_setting('request.jwt.claims', true)::json->>'sub'`.
- Migrations and test bootstrap align with Supabase roles named `authenticated` and `anon`.
- `drizzle.config.ts` supports direct migration URLs through `POSTGRES_URL_NON_POOLING`, with `POSTGRES_URL` as fallback.

## External Constraints Verified

- Supabase Postgres connection choice matters. Direct connections support IPv6 only; transaction pooler works broadly but does not support prepared statements and is not safe for session-state patterns like `SET ROLE` plus session-scoped `set_config`.
- Supabase exposes first-party roles such as `anon`, `authenticated`, and `service_role`; the repo now aligns concrete unauthenticated DB role usage to Supabase-native `anon`.
- Supabase now supports Clerk through Supabase Third-Party Auth. Current docs say to enable Clerk as a third-party provider in Supabase and pass a Clerk token to Supabase APIs. Older Clerk JWT-template recipes are deprecated.
- Supabase also has a Clerk foreign data wrapper. It lets Postgres read Clerk objects such as `users` through the Wrappers extension, but it requires Clerk API credentials inside Postgres, preferably via Vault, and adds a database-to-Clerk API dependency. Treat this as optional admin/sync infrastructure, not the Phase 3 request-auth source of truth.
- Clerk's Next.js integration uses Clerk middleware plus server helpers to protect routes and read the current user/session.

Sources:

- Supabase Clerk third-party auth: https://supabase.com/docs/guides/auth/third-party/clerk
- Supabase connection strings and pooling: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase Postgres roles: https://supabase.com/docs/guides/database/postgres/roles
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Clerk + Supabase integration: https://clerk.com/docs/integrations/databases/supabase
- Clerk Next.js middleware: https://clerk.com/docs/references/nextjs/clerk-middleware
- Supabase Clerk foreign data wrapper: https://supabase.com/docs/guides/database/extensions/wrappers/clerk

## Architecture Strategy

Keep the server-side Drizzle + request-scoped RLS architecture, use Clerk for identity, and point the database layer at Supabase Postgres.

Do not rewrite the app around `@supabase/supabase-js` for user data unless there is a separate architecture decision. The app already has a strong server query boundary; preserve it.

Do not use the Supabase Clerk foreign data wrapper as the request-time authentication boundary. Read the active Clerk session through Clerk's Next.js server helpers, provision the local `users` row, and keep the app's existing request-scoped RLS model. The FDW may be useful later for back-office inspection, drift checks, or one-time reconciliation, but putting it on the sign-in/request path would create unnecessary latency, secret-management, and availability risk.

## Non-Goals

- No Supabase Auth adoption.
- No client-side data access rewrite.
- No Clerk foreign data wrapper on the request-auth path.
- No broad query-layer refactor beyond auth/RLS compatibility.
- No Stripe, AI, plan-generation, or billing behavior changes unless auth user IDs affect them directly.

## Provider Setup Decisions

1. Create a new Supabase project in the same region as the intended app deployment.
2. Create Clerk application(s) for development and production.
3. In Supabase, enable Clerk under Third-Party Auth.
4. Decide DB URL roles:
   - `POSTGRES_URL_NON_POOLING`: Supabase direct connection if IPv6 works from the runtime/CI, otherwise session pooler.
   - `POSTGRES_URL`: session pooler or direct connection for app server connections.
   - Avoid transaction pooler for request-scoped RLS clients while the app uses `SET ROLE` and session variables.
5. Use Supabase-native `anon` for unauthenticated database-role handling.

Exit criteria:

- Supabase project exists.
- Clerk app exists.
- DB connection strings are captured in local env and deployment secret manager.
- Role-name decision is documented and implemented: use Supabase-native `anon`.

## Dependency and Env Boundary

1. Keep Clerk packages:
   - `@clerk/nextjs`
2. Keep `postgres`, `drizzle-orm`, Supabase CLI tooling, and current Drizzle schema tooling.
3. Use Clerk-focused env variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - optional Clerk sign-in/sign-up redirect settings if the app needs explicit paths
4. Keep `.env.example`, `docs/development/environment.md`, `README.md`, and deployment docs aligned with current Supabase/Clerk env names.

Exit criteria:

- Type-safe env layer validates Clerk config.
- Runtime requirements use Supabase and Clerk env vars only.

## Auth UI and Route Protection

1. Use `ClerkProvider` in `src/app/layout.tsx`.
2. Use Clerk sign-in/sign-up UI:
   - Either Clerk components on existing `/auth/sign-in` and `/auth/sign-up` routes.
   - Or Clerk-hosted pages with app routes redirecting to Clerk paths.
3. Use Clerk user controls in `src/components/shared/AuthControls.tsx`.
4. Use Clerk middleware protection in `src/proxy.ts`.
5. Preserve route protection semantics:
   - Protected: `/dashboard`, `/api`, `/plans`, `/account`, `/settings`, `/analytics`
   - Public: auth routes, Stripe webhook, static assets, maintenance behavior
6. Keep local product testing bypass intentional and provider-neutral.

Exit criteria:

- Anonymous protected page redirects to sign-in.
- Authenticated protected page loads.
- Stripe webhook still bypasses auth.
- Local product testing still works with seeded `DEV_AUTH_USER_ID`.

## Server Auth Boundary

1. Keep `src/lib/auth/server.ts` as the Clerk server helper wrapper boundary.
2. Keep session-read semantics provider-neutral for callers:
   - Return Clerk user/session data in the shape needed by `src/lib/api/auth.ts`.
   - Fail closed on strict auth checks.
3. Update `getEffectiveAuthUserId()`:
   - Development/test override remains first.
   - Production reads Clerk `userId`.
4. Update `getAuthUserId()` for security-sensitive flows to ignore dev overrides and read real Clerk identity.
5. Update `ensureUserRecord()`:
   - Use Clerk user email/name from Clerk server APIs.
   - Create `users.auth_user_id = clerkUserId`.
   - Decide whether email is mandatory; current app requires it.
6. Do not add the Supabase Clerk foreign data wrapper here.
   - The authenticated request already has a Clerk session and `userId`.
   - Use Clerk server APIs for any profile fields needed during provisioning.
   - Keep the local `users` table as the app-owned profile/billing/progress join point.

Exit criteria:

- `requestBoundary.route`, `.component`, and `.action` still get the same internal `DbUser` shape.
- Existing callers do not learn about Clerk directly.
- User provisioning is covered by tests for missing user, missing email, and existing user.
- No request path depends on database-side reads from `clerk.users`.

## Supabase RLS Compatibility

1. Keep `users.auth_user_id` as the external provider ID. It will now store Clerk user IDs.
2. Keep policies based on `request.jwt.claims.sub` unless there is a deliberate switch to native Supabase `auth.jwt()`.
3. Use provider-neutral RLS comments and docs.
4. Use Supabase-native `anon` for the concrete unauthenticated database role.
5. Keep test bootstrap and CI grant setup aligned with selected role names.
6. Verify all policy/grant migrations apply to a fresh Supabase database.

Exit criteria:

- Fresh Supabase DB can run the full migration chain.
- Authenticated RLS user can read/write only own rows.
- Anonymous/anon role cannot access private app data.
- Service-role/background clients still bypass RLS only in intended paths.

## Database Operations

1. Run `pnpm db:migrate` using `POSTGRES_URL_NON_POOLING` pointed at a Supabase direct/session connection when DDL needs it.
2. Run seed/bootstrap only against local/dev DBs, not production.
3. Point local `.env.local` to Supabase local or the intended development database for smoke passes.
4. Keep deployment env vars pointed at the intended Supabase project.

Exit criteria:

- `drizzle.__drizzle_migrations` shows expected latest migration once.
- App boots with Supabase URL.
- Runtime and migration commands use current Supabase/Clerk env names.

## Optional Later - Clerk FDW Reconciliation

Use this only if there is a concrete operational need to query Clerk from Postgres.

Possible uses:

1. Back-office checks that compare local `users.auth_user_id` against Clerk `users.id`.
2. One-time reconciliation after manual Clerk dashboard changes.
3. Admin reporting over Clerk organizations or invitations if those become product requirements.

Guardrails:

- Keep the FDW schema private; do not expose it to app clients or Supabase Data API roles.
- Store Clerk API credentials in Supabase Vault, not plain FDW server options.
- Do not join FDW tables in latency-sensitive request paths.
- Do not replace local `users` rows with live foreign `clerk.users` rows; local rows remain the app-owned identity/profile anchor.

## Validation

Minimum targeted validation during implementation:

- `pnpm check:type`
- Auth boundary unit tests.
- Proxy/middleware policy unit tests.
- RLS/security tests.
- User profile/preference route tests.
- One API route test behind `requestBoundary.route`.
- One server component/action auth test.

Manual smoke:

- Anonymous visit to `/dashboard` redirects to sign-in.
- Sign up with Clerk.
- User row is created with Clerk user id.
- Create a plan.
- Reload `/plans` and plan detail.
- Update profile/preferences.
- Sign out.
- Anonymous API request returns 401.
- Stripe webhook route remains reachable without auth.

Final baseline before merge:

- `pnpm test:changed`
- `pnpm check:full`

## Main Risks

1. Connection pooling mismatch.
   - `SET ROLE` plus session `request.jwt.claims` needs a stable session. Transaction poolers are the wrong tool here.
2. Role name drift.
   - Supabase uses `anon`; repo code, migrations, tests, and CI grant setup must stay aligned to that concrete role.
3. User ID assumption drift.
   - Clerk user IDs are string IDs, not necessarily UUIDs. Current `users.auth_user_id` is text, so schema is fine. Tests must stop assuming UUID unless they intentionally use the dev seed.

## Open Questions

1. Where will the app deploy for launch? This decides whether Supabase direct IPv6 is usable or session pooler is required.
2. Do you want Clerk-hosted auth pages or app-embedded Clerk components matching the current `/auth/*` URLs?
3. Should local product testing continue using the deterministic UUID-shaped `DEV_AUTH_USER_ID`, or should it switch to a Clerk-shaped seed like `user_dev...`?
