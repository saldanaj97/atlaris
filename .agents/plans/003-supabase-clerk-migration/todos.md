# Supabase Postgres + Clerk Auth Migration

## Acceptance Criteria

- [ ] App uses Supabase Postgres for runtime and migrations.
- [ ] App uses Clerk for sign-in, sign-up, session reads, user button, and route protection.
- [ ] Neon Auth packages, env vars, UI imports, CSS imports, and docs references are removed or intentionally archived.
- [ ] Existing request-boundary contract remains stable for API routes, server components, and server actions.
- [ ] RLS still fails closed and isolates rows by `users.auth_user_id`.
- [ ] Fresh Supabase database can run the migration chain.
- [ ] Local product testing remains documented and usable.
- [ ] Final validation passes: `pnpm test:changed` and `pnpm check:full`.

## Tasks

### Phase 0 - Provider Setup Decisions

- [ ] Create Supabase project in target deployment region.
- [ ] Create Clerk application(s) for development and production.
- [ ] Enable Clerk under Supabase Third-Party Auth.
- [ ] Choose Supabase DB connection strings for migrations and runtime.
- [ ] Decide whether anonymous role becomes Supabase-native `anon` or remains explicit `anonymous`.

### Phase 1 - Dependency and Env Boundary

- [ ] Add `@clerk/nextjs`.
- [ ] Replace `neonAuthEnv` with Clerk env config.
- [ ] Update `.env.example`.
- [ ] Update development/deployment docs.
- [ ] Remove `@neondatabase/auth`, `better-auth`, and `@better-auth/passkey` after replacements compile.

### Phase 2 - Auth UI and Route Protection

- [ ] Replace `NeonAuthUIProvider` with `ClerkProvider`.
- [ ] Replace Neon auth page with Clerk sign-in/sign-up route handling.
- [ ] Replace Neon `UserButton` usage.
- [ ] Replace Neon middleware in `src/proxy.ts` with Clerk middleware protection.
- [ ] Preserve public bypasses for auth routes, Stripe webhook, maintenance, and static assets.
- [ ] Rename Neon-specific dev-bypass helpers.

### Phase 3 - Server Auth Boundary

- [ ] Replace `src/lib/auth/server.ts` with Clerk server wrapper.
- [ ] Update `getEffectiveAuthUserId()`.
- [ ] Update `getAuthUserId()`.
- [ ] Update `ensureUserRecord()` to read Clerk user data.
- [ ] Add/update tests for existing user, missing user, missing email, and dev override.

### Phase 4 - Supabase RLS Compatibility

- [ ] Keep `users.auth_user_id` as external provider id, now populated with Clerk user ids.
- [ ] Keep or deliberately replace `request.jwt.claims.sub` policy contract.
- [ ] Align anonymous role naming across code, migrations, tests, and CI.
- [ ] Update RLS comments/docs from Neon-specific wording to provider-neutral wording.
- [ ] Verify full migration chain against a fresh Supabase database.

### Phase 5 - Database Connection Cutover

- [ ] Run Supabase migration with direct/session connection URL.
- [ ] Verify `drizzle.__drizzle_migrations`.
- [ ] Smoke local app against Supabase.
- [ ] Update deployment env vars after local smoke passes.
- [ ] Confirm no Neon runtime imports remain.

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
