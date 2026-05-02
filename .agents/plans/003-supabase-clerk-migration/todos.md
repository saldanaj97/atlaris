# Supabase Postgres + Clerk Auth Migration

## Acceptance Criteria

- [ ] App uses Supabase Postgres for runtime and migrations.
- [ ] App uses Clerk for sign-in, sign-up, session reads, user button, and route protection.
- [x] Neon Auth packages, env vars, UI imports, CSS imports, and docs references are removed or intentionally archived.
- [ ] Existing request-boundary contract remains stable for API routes, server components, and server actions.
- [ ] RLS still fails closed and isolates rows by `users.auth_user_id`.
- [ ] Fresh Supabase database can run the migration chain.
- [ ] Local product testing remains documented and usable.
- [ ] Final validation passes: `pnpm test:changed` and `pnpm check:full`.

## Tasks

### Phase 0 - Provider Setup Decisions

- [x] Create Supabase project in target deployment region.
- [x] Create Clerk application(s) for development and production.
- [x] Enable Clerk under Supabase Third-Party Auth.
- [x] Choose Supabase DB connection strings for migrations and runtime.
- [x] Decide whether anonymous role becomes Supabase-native `anon` or remains explicit `anonymous` — use Supabase-native `anon`.

### Phase 1 - Dependency and Env Boundary

- [x] Add `@clerk/nextjs`.
- [x] Add Clerk env config and export `clerkAuthEnv`.
- [x] Update `.env.example`.
- [x] Update development/deployment docs.
- [x] Remove `@neondatabase/auth`, `better-auth`, and `@better-auth/passkey` after server auth replacement compiles.

### Phase 2 - Auth UI and Route Protection

- [x] Replace `NeonAuthUIProvider` with `ClerkProvider`.
- [x] Replace Neon auth page with Clerk sign-in/sign-up route handling.
- [x] Replace Neon `UserButton` usage.
- [x] Replace Neon middleware in `src/proxy.ts` with Clerk middleware protection.
- [x] Preserve public bypasses for auth routes, Stripe webhook, maintenance, and static assets.
- [x] Rename Neon-specific dev-bypass helpers.

### Phase 3 - Server Auth Boundary

- [x] Replace `src/lib/auth/server.ts` with Clerk server wrapper.
- [x] Update `getEffectiveAuthUserId()`.
- [x] Update `getAuthUserId()`.
- [x] Update `ensureUserRecord()` to read Clerk user data.
- [x] Keep Supabase Clerk FDW out of the request-auth path; use Clerk server APIs for active-session provisioning.
- [x] Add/update tests for existing user, missing user, missing email, and dev override.

### Phase 4 - Supabase RLS Compatibility

- [x] Keep `users.auth_user_id` as external provider id, now populated with Clerk user ids.
- [x] Keep `request.jwt.claims.sub` policy contract for the first Supabase migration.
- [x] Align anonymous role naming across code, migrations, tests, and CI to Supabase-native `anon`.
- [x] Update RLS comments/docs from Neon-specific wording to provider-neutral wording.
- [x] Verify full migration chain against a fresh Supabase database.

### Phase 5 - Database Connection Cutover

- [x] Run Supabase migration with direct/session connection URL.
- [x] Verify `drizzle.__drizzle_migrations`.
- [ ] Smoke local app against Supabase.
- [ ] Update deployment env vars after local smoke passes.
- [ ] Confirm no Neon runtime imports remain.

### Optional Later - Clerk FDW Reconciliation

- [ ] Only if needed, evaluate Supabase Clerk FDW for admin/reconciliation queries.
- [ ] If adopted, keep Clerk FDW schema private and store Clerk API credentials in Supabase Vault.
- [ ] Do not use `clerk.users` FDW reads in latency-sensitive auth/request paths.

### Phase 6 - Validation

- [ ] Run auth boundary unit tests.
- [ ] Run proxy/middleware policy unit tests.
- [ ] Run RLS/security tests.
- [ ] Run targeted API/server component auth tests.
- [ ] Run manual auth smoke.
- [ ] Run `pnpm test:changed`.
- [ ] Run `pnpm check:full`.

## Review

### Notes

- Initial planning only. No implementation started.
- App is pre-launch, so fresh Supabase DB is acceptable and data-copy tooling is out of scope.
- Phase 0 complete as of user confirmation. Role decision: migrate repo usage from `anonymous` to Supabase-native `anon`.
- Phase 1 started with dependency/env boundary only. Neon Auth packages intentionally remained until Phase 3 replaced the server auth boundary.
- Legacy `@neondatabase/auth` was pinned to the currently locked `0.2.0-beta.1` instead of leaving `latest`; otherwise adding Clerk opportunistically upgrades the legacy auth stack during the migration.
- Phase 2 uses Clerk's documented Next.js shapes: `ClerkProvider` at the root layout, dedicated catch-all sign-in/sign-up pages, `UserButton`, and `clerkMiddleware` with `auth.protect()` for protected routes.
- Phase 2 intentionally left server session reads for Phase 3; Phase 3 migrated `src/lib/auth/server.ts` and request-boundary user provisioning.
- Supabase Clerk FDW reviewed before Phase 3. It may help later for admin/reconciliation, but Phase 3 should not depend on it for request-time auth because Clerk server helpers already provide the active session and avoid database-side remote API coupling.
- Phase 3 replaced Neon server auth with Clerk server helpers, removed the legacy `/api/auth/[...path]` route, removed Neon Auth packages/env config, and kept local seeded-user bypass behavior for development/test.
- Phase 4 keeps the existing `request.jwt.claims.sub` RLS contract, switches concrete unauthenticated DB role usage from `anonymous` to Supabase-native `anon`, and updates bootstrap/CI grants to match Supabase role names.
- Phase 4 fresh migration-chain verification passed against the repo's disposable PostgreSQL/Testcontainers path. Actual fresh Supabase project verification remains unchecked until `DATABASE_URL_NON_POOLING` points at the target Supabase database.
