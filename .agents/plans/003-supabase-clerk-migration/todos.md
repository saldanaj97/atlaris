# Supabase Postgres + Clerk Auth

## Acceptance Criteria

- [x] App uses Supabase Postgres for runtime and migrations.
- [x] App uses Clerk for sign-in, sign-up, session reads, user button, and route protection.
- [x] Runtime packages, env vars, UI imports, CSS imports, and docs references match the current Supabase/Clerk stack.
- [x] Existing request-boundary contract remains stable for API routes, server components, and server actions.
- [x] RLS still fails closed and isolates rows by `users.auth_user_id`.
- [x] Fresh Supabase database can run the migration chain.
- [x] Local product testing remains documented and usable.
- [x] Final validation passes: `pnpm test:changed` and `pnpm check:full`.

## Tasks

### Provider Setup Decisions

- [x] Create Supabase project in target deployment region.
- [x] Create Clerk application(s) for development and production.
- [x] Enable Clerk under Supabase Third-Party Auth.
- [x] Choose Supabase DB connection strings for migrations and runtime.
- [x] Use Supabase-native `anon` for the unauthenticated database role.

### Dependency and Env Boundary

- [x] Keep `@clerk/nextjs`.
- [x] Add Clerk env config and export `clerkAuthEnv`.
- [x] Update `.env.example`.
- [x] Update development/deployment docs.

### Auth UI and Route Protection

- [x] Use `ClerkProvider`.
- [x] Use Clerk sign-in/sign-up route handling.
- [x] Use Clerk user controls.
- [x] Use Clerk middleware protection in `src/proxy.ts`.
- [x] Preserve public bypasses for auth routes, Stripe webhook, maintenance, and static assets.
- [x] Keep dev-bypass helpers provider-neutral.

### Server Auth Boundary

- [x] Keep `src/lib/auth/server.ts` as the Clerk server wrapper.
- [x] Update `getEffectiveAuthUserId()`.
- [x] Update `getAuthUserId()`.
- [x] Update `ensureUserRecord()` to read Clerk user data.
- [x] Keep Supabase Clerk FDW out of the request-auth path; use Clerk server APIs for active-session provisioning.
- [x] Add/update tests for existing user, missing user, missing email, and dev override.

### Supabase RLS Compatibility

- [x] Keep `users.auth_user_id` as external provider id, now populated with Clerk user ids.
- [x] Keep `request.jwt.claims.sub` policy contract.
- [x] Align anonymous role naming across code, migrations, tests, and CI to Supabase-native `anon`.
- [x] Keep RLS comments/docs provider-neutral.
- [x] Verify full migration chain against a fresh Supabase database.

### Database Operations

- [x] Run Supabase migration with direct/session connection URL.
- [x] Verify `drizzle.__drizzle_migrations`.
- [x] Use Supabase CLI local stack commands.
- [x] Move Drizzle migration output and CI drift checks to `supabase/migrations`.
- [x] Seed deterministic local product-testing user through `supabase/seed.sql`.
- [x] Smoke local app against Supabase.
- [x] Update deployment env vars after local smoke passes.
- [x] Confirm runtime imports match current Supabase/Clerk stack.

### Optional Later - Clerk FDW Reconciliation

- [ ] Only if needed, evaluate Supabase Clerk FDW for admin/reconciliation queries.
- [ ] If adopted, keep Clerk FDW schema private and store Clerk API credentials in Supabase Vault.
- [ ] Do not use `clerk.users` FDW reads in latency-sensitive auth/request paths.

### Phase 6 - Validation

- [x] Run auth boundary unit tests.
- [x] Run proxy/middleware policy unit tests.
- [x] Run RLS/security tests.
- [x] Run targeted API/server component auth tests.
- [x] Run manual auth smoke.
- [x] Run `pnpm test:changed`.
- [x] Run `pnpm check:full`.

## Review

### Notes

- Initial planning only. No implementation started.
- App uses Supabase Postgres, Clerk Auth, and a provider-neutral request boundary.
- Role decision: repo usage aligns with Supabase-native `anon`.
- Clerk integration uses documented Next.js shapes: `ClerkProvider` at the root layout, dedicated catch-all sign-in/sign-up pages, `UserButton`, and `clerkMiddleware` with `auth.protect()` for protected routes.
- Supabase Clerk FDW may help later for admin/reconciliation, but request-time auth depends on Clerk server helpers because they already provide the active session and avoid database-side remote API coupling.
- Server auth uses Clerk server helpers and keeps local seeded-user bypass behavior for development/test.
- RLS keeps the existing `request.jwt.claims.sub` contract and keeps bootstrap/CI grants aligned to Supabase role names.
- Fresh migration-chain verification passed against the repo's disposable PostgreSQL/Testcontainers path. Fresh Supabase project verification uses `POSTGRES_URL_NON_POOLING` pointed at the target Supabase database.
- Local dev DB uses Supabase CLI commands, `supabase/migrations`, `supabase/seed.sql`, and Testcontainers for automated integration/security isolation.
- Local Supabase reset passed through migration `0030` and applied `supabase/seed.sql`; `pnpm db:dev:seed`, targeted env/DB guard tests, `pnpm test:security`, `pnpm test:changed`, and `pnpm check:full` passed.
- Local runtime smoke started `pnpm dev` against Supabase local and loaded `/dashboard` with the seeded dev-auth user (`200`). `/api/health` returned `404` because that route is not present.
