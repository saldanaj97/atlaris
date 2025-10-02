# Test Infrastructure Fixes & CI/CD Readiness

## 🎯 Overview

This document tracks the issues found in the current test setup and the plan to make the test suite CI/CD ready while properly handling Supabase RLS, Clerk auth, and Drizzle ORM.

---

## ❌ Critical Issues Found

### 1. **RLS Bypass in Tests** (CRITICAL)

**Problem:** Your Postgres schema has extensive RLS policies (113+ policy references) that are **completely bypassed** in tests.

**Why it happens:**

- Production: Supabase enforces RLS based on JWT token role (`authenticated`, `anon`, `service_role`)
- Tests: Direct Postgres connection as superuser → RLS not enforced
- Tests pass but production behavior might differ

**Current test auth approach:**

```typescript
// tests/helpers/auth.ts - Just sets env var, doesn't set Postgres role/JWT context
export function setTestUser(clerkUserId: string) {
  process.env.DEV_CLERK_USER_ID = clerkUserId; // ❌ Not setting JWT context
}
```

**Impact:**

- ❌ RLS policies not actually tested
- ❌ Tests may pass when production fails
- ❌ False confidence in security policies

**Solutions (pick one):**

#### Option A: Disable RLS in test DB (RECOMMENDED for now - simplest)

```sql
-- Run once in test DB
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE learning_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE modules DISABLE ROW LEVEL SECURITY;
-- ... for all tables
```

**Pros:** Simple, tests run fast, no code changes
**Cons:** RLS not tested

#### Option B: Use service_role connection (bypass RLS intentionally)

```typescript
// Update src/lib/db/drizzle.ts for test environment
if (process.env.NODE_ENV === 'test') {
  // Use service_role key to bypass RLS
  const client = createClient(url, service_role_key);
}
```

**Pros:** Intentional bypass, clear in code
**Cons:** RLS still not tested, requires service_role key

#### Option C: Set proper auth context per test (BEST but complex)

```typescript
// In test setup, set Postgres role and JWT claims
await db.execute(sql`SET LOCAL ROLE authenticated`);
await db.execute(
  sql`SELECT set_config('request.jwt.claims', '{"sub": "${clerkUserId}"}', true)`
);
```

**Pros:** Actually tests RLS
**Cons:** Complex, slower, requires Supabase-specific setup

**Recommendation:** Start with **Option A** (disable RLS in test DB), document the gap, add E2E tests later that test actual Supabase RLS.

---

### 2. **DATABASE_URL Configuration Conflicts** (FIXED by user)

**Problem:** Three different places trying to set DATABASE_URL with conflicting logic:

- ~~`vitest.config.ts` - fallback logic~~
- ~~`tests/setup.ts` - unconditional override (REMOVED by user ✅)~~
- `scripts/run-tests.mjs` - conditional override

**Status:** Mostly fixed by user commenting out the override in `tests/setup.ts`

**Remaining cleanup needed:**

- Update `scripts/run-tests.mjs` to trust `.env.test`
- Simplify `vitest.config.ts` logic

---

### 3. **Hardcoded localhost references** (BLOCKING CI/CD)

**Problem:** `vitest.config.ts:16` has hardcoded localhost:

```typescript
process.env.DATABASE_URL = `postgresql://${dbUser}:${dbPass}@127.0.0.1:54322/postgres`;
```

**Impact:**

- ❌ Won't work in GitHub Actions
- ❌ Assumes local Supabase/Docker running on port 54322

**Solution:** Need to decide:

- Use Supabase test database (from `.env.test`) for both local and CI
- OR use Docker/GitHub Actions Postgres service for CI

---

### 4. **No CI/CD Infrastructure**

**Missing:**

- No `.github/workflows/` files
- No Docker setup for test database
- No documentation on running tests locally

---

## ✅ What's Working Well

### Drizzle ORM Setup

- ✅ Direct Postgres connection working
- ✅ Schema with Supabase helpers (`authenticatedRole`, `authUid`)
- ✅ Transaction support
- ✅ Proper truncation between tests (`tests/helpers/db.ts`)

### Clerk Authentication (for unit/integration)

- ✅ Adequately mocked with `setTestUser()` for API route logic
- ✅ Works for business logic testing
- ⚠️ Does NOT test actual Clerk middleware/JWT validation (OK for now)

### Test Organization

- ✅ Good structure: unit, integration, contract, perf tests
- ✅ Vitest configured properly
- ✅ Mutex for DB concurrency control
- ✅ Test isolation with truncation

---

## 📋 Recommended Fix Order

### Phase 1: Fix Configuration Issues ⚡ (Do First)

- [x] **1.1** Remove localhost fallback from `vitest.config.ts` (or make it conditional on CI env var)
- [x] **1.2** Update `scripts/run-tests.mjs` to not override DATABASE_URL
- [x] **1.3** Verify `.env.test` is loaded correctly
- [x] **1.4** Test that `pnpm test` works with Supabase test DB

**Goal:** Tests use `.env.test` DATABASE_URL consistently

---

### Phase 2: Handle RLS Testing Gap 🔒

Pick one approach:

- [ ] **2.1** Create migration to disable RLS in test DB
  - Create `test-db-disable-rls.sql`
  - Run manually on test DB
  - Document in README

OR

- [x] **2.2** Update Drizzle client to use service_role in tests (ADOPTED – implemented as direct DB owner connection + dedicated RLS security test suite)
  - IMPLEMENTATION DETAIL: Instead of switching to the Supabase JS client with a `service_role` key, we kept the existing direct `postgres-js` owner connection in `src/lib/db/drizzle.ts`, which inherently bypasses RLS for business logic, integration, and contract tests (same net effect as service_role bypass).
  - RLS is now explicitly covered by a separate security test suite in `tests/security/rls.policies.spec.ts` using real Supabase clients created via helpers in `tests/helpers/rls.ts` (anon, authenticated with generated JWT, and service role).
  - This hybrid approach gives:
    - Fast, deterministic non-RLS tests (no per-test auth context plumbing)
    - Explicit, focused verification of RLS behavior in one place
    - Clear documentation via the RLS BYPASS NOTE comment block in `drizzle.ts`.
  - Original TODO items for this option (service_role key + Supabase client swap) are no longer required; superseded by the hybrid approach.

OR

- [ ] **2.3** Implement proper auth context setting
  - Update `tests/helpers/auth.ts` to set Postgres role
  - Set JWT claims in Postgres session
  - Test with actual RLS enforcement

**Recommendation:** Start with **2.1** (disable RLS in test DB)

---

### Phase 3: Add CI/CD (GitHub Actions) 🚀

Choose infrastructure approach:

#### Option A: Supabase Test DB (Current .env.test approach)

- [ ] **3.1** Create `.github/workflows/test.yml`
- [ ] **3.2** Add Supabase credentials as GitHub Secrets
- [ ] **3.3** Run migrations in CI before tests
- [ ] **3.4** Test the workflow

**Pros:** No Docker needed, simple
**Cons:** Network dependency, potential costs

#### Option B: Docker + GitHub Actions Postgres Service (RECOMMENDED)

- [x] **3.1** ~~Create `docker-compose.test.yml` with Postgres 15~~ (Using Supabase CLI Docker stack instead - provides full Auth service needed for Clerk JWT validation)
- [x] **3.2** Update `.env.test` to use Docker (localhost:54322)
- [x] **3.3** Add npm scripts: `test:db:start`, `test:db:stop`, `test:db:reset`, `test:db:status`
- [x] **3.4** Create `.github/workflows/test.yml` with Supabase CLI + Docker
- [x] **3.5** Run migrations in CI before tests (`supabase db reset`)
- [x] **3.6** Test locally with Docker (17/17 tests passing)
- [ ] **3.7** Test in GitHub Actions (ready to push and test)

**Pros:** Fast, offline, free, industry standard
**Cons:** Requires Docker locally

---

### Phase 4: Full CI Pipeline 🔧

- [ ] **4.1** Create `.github/workflows/ci.yml`
  - Lint (`pnpm lint`)
  - Type check (`pnpm type-check`)
  - Test (`pnpm test`)
  - Build (`pnpm build`)
- [ ] **4.2** Add status badges to README
- [ ] **4.3** Configure branch protection rules

---

### Phase 5: Documentation 📚

- [ ] **5.1** Update README with test setup instructions
- [ ] **5.2** Document RLS testing strategy
- [ ] **5.3** Document environment variables needed
- [ ] **5.4** Create TESTING.md with detailed guide
- [ ] **5.5** Add troubleshooting section

---

## 🔑 Key Decisions Needed

1. **RLS Testing Strategy:** Disable in test DB vs. Properly test vs. Service role bypass?
2. **Test DB Infrastructure:** Supabase cloud vs. Docker local vs. Hybrid?
3. **CI Platform:** GitHub Actions (assumed) or other?

---

## 📝 Notes

### Current Stack Impact Summary

| Component          | Current State        | Issues                           | Recommendation                             |
| ------------------ | -------------------- | -------------------------------- | ------------------------------------------ |
| **Supabase RLS**   | ❌ Bypassed in tests | Tests don't match prod           | Disable RLS in test DB or use service_role |
| **Clerk Auth**     | ⚠️ Partially mocked  | Middleware not tested            | Current approach OK for now                |
| **Drizzle**        | ✅ Good              | None                             | Keep as-is                                 |
| **Test DB Config** | ✅ Fixed by user     | Was overriding .env.test         | Clean up remaining fallbacks               |
| **CI/CD Ready**    | ❌ No                | No workflow, localhost hardcoded | Add GH Actions + Docker                    |

### Environment Variables Audit

**Required in .env.test:**

- `NODE_ENV=test` ✅
- `DATABASE_URL` ✅ (Supabase or Docker)
- `DEV_CLERK_USER_ID` ✅ (mocked)
- `MOCK_GENERATION_DELAY_MS` ✅
- `MOCK_GENERATION_FAILURE_RATE` ✅

**May need to add:**

- `SUPABASE_SERVICE_ROLE_KEY` (if using service_role approach)
- `CI=true` (for GitHub Actions detection)

---

## 🎯 Immediate Next Steps

1. **Fix vitest.config.ts localhost fallback** - Make it only apply when DATABASE_URL is not set
2. **Decide on RLS strategy** - Recommend: Disable RLS in test DB for now
3. **Choose infrastructure approach** - Recommend: Docker for local + CI
4. **Implement Phase 1** (config fixes)
5. **Implement Phase 2** (RLS strategy)
6. **Implement Phase 3** (CI/CD)

---

## Original Docker-based Plan (Detailed)

**If choosing Option B (Docker) in Phase 3, here's the detailed plan:**

1. **Create docker-compose.test.yml** with Postgres 15 (matching likely production version)

2. **Update .env.test** to use Docker database (localhost:54322)

3. **Fix configuration conflicts:**
   - Remove unconditional DATABASE_URL override from `tests/setup.ts` ✅ DONE
   - Simplify `vitest.config.ts` to trust .env.test
   - Update `scripts/run-tests.mjs` to remove localhost fallback

4. **Add test database scripts to package.json:**
   - `test:db:up` - Start Docker test database
   - `test:db:down` - Stop Docker test database
   - `test:db:reset` - Reset test database

5. **Create GitHub Actions workflow** (.github/workflows/test.yml):
   - Run tests on push/PR
   - Use Postgres service container
   - Run migrations before tests
   - Generate coverage reports

6. **Add .github/workflows/ci.yml** for full CI pipeline:
   - Lint, type-check, test, build

7. **Create test setup documentation** in README or TESTING.md

**Optional:** Keep Supabase config as alternative via env var flag
