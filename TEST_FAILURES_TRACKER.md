# Test Failures Analysis and Tracking

**Created**: 2025-11-20
**Workflow Run**: https://github.com/saldanaj97/atlaris/actions/runs/19551885514
**Status**: 🔴 Multiple e2e and integration tests failing

## Root Cause Analysis

### Primary Issue: Missing RLS Role Permissions

The test failures are caused by **missing table permissions for RLS roles** (`authenticated` and `anonymous`). Here's the chain of events:

1. **CI Setup** (`.github/workflows/ci-main.yml`):
   - Lines 197-198: Creates `anonymous` and `authenticated` roles
   - Line 217/402: Grants `BYPASSRLS` to `postgres` user
   - **Missing**: No `GRANT` statements to give table permissions to `authenticated`/`anonymous` roles

2. **Test Execution Flow**:
   - Tests set up data using service-role DB (postgres user with BYPASSRLS)
   - Application code uses `getDb()` which returns RLS-enforced clients
   - RLS clients execute `SET ROLE authenticated` to switch roles
   - Queries fail because `authenticated` role has no SELECT/INSERT/UPDATE/DELETE permissions on tables

3. **Recent Workaround** (Commit 78dcced):
   - Added test-only fallback in Google Calendar sync route
   - Re-queries using service-role DB if RLS query returns no results
   - This is a band-aid, not a proper fix

### Key Finding from Research

According to PostgreSQL RLS best practices:

- **Superusers and BYPASSRLS roles bypass RLS completely**
- **SET ROLE testing requires proper permissions**: When using `SET ROLE` to test RLS, the target role must have table permissions (SELECT, INSERT, etc.)
- **Common mistake**: Creating roles for RLS but not granting them table access

## Affected Test Categories

### E2E Tests (All 4 Shards Failing)

Location: `tests/e2e/**/*.{spec,test}.{ts,tsx}`

1. `tests/e2e/plan-schedule-view.spec.tsx`
2. `tests/e2e/plan-generation.test.ts`
3. `tests/e2e/plan-generation-dates.spec.ts`
4. `tests/e2e/onboarding-dates-ui.spec.tsx`
5. `tests/e2e/google-calendar-sync-flow.spec.ts`
6. `tests/e2e/regeneration.ui.spec.tsx`
7. `tests/e2e/plan-generation-curation.spec.ts`
8. `tests/e2e/notion-export-flow.spec.ts`

### Integration Tests (All 4 Shards Failing)

Location: `tests/integration/**/*.{spec,test}.{ts,tsx}`

**RLS-Specific Tests** (High Priority):

- `tests/integration/rls/attempts-visibility.spec.ts`
- `tests/integration/rls/cross-tenant-blocking.spec.ts`
- `tests/integration/rls/attempts-insert.spec.ts`
- `tests/integration/api/plans.status.rls.spec.ts`
- `tests/integration/api/google-calendar-sync.rls.spec.ts`

**API Integration Tests**:

- `tests/integration/api/google-calendar-sync-route.spec.ts`
- `tests/integration/api/plans.regenerate.spec.ts`
- `tests/integration/api/plans.onboarding-dates.spec.ts`
- `tests/integration/api/user-subscription.spec.ts`
- `tests/integration/api/user-profile.spec.ts`
- And 60+ more integration tests...

## Required Fixes

### 1. Update CI Workflow to Grant Role Permissions

**File**: `.github/workflows/ci-main.yml`

**Changes needed** (after line 211 and line 396):

```sql
-- Grant permissions to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Grant permissions to anonymous role (read-only for public data)
GRANT USAGE ON SCHEMA public TO anonymous;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anonymous;
```

### 2. Update Test Setup Helper

**File**: `tests/helpers/db.ts`

Add function to ensure RLS roles have proper permissions:

```typescript
export async function ensureRlsRolePermissions() {
  if (appEnv.isTest) {
    await client.unsafe(`
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

      GRANT USAGE ON SCHEMA public TO anonymous;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
    `);
  }
}
```

Call this in `tests/setup.ts` after `ensureRlsRolesAndPermissions()`.

### 3. Remove Test-Only Workaround

**File**: `src/app/api/v1/integrations/google-calendar/sync/route.ts`

Remove lines 37-46 (the test-only fallback that re-queries via service-role DB).

### 4. Review Other Routes with Similar Workarounds

**Files to check**:

- `src/app/api/v1/plans/route.ts`
- `src/lib/db/queries/plans.ts`

Remove any similar test-only service-role DB fallbacks.

## Verification Steps

1. ✅ Grant permissions to RLS roles in CI workflow
2. ✅ Update test setup to grant permissions
3. ✅ Remove test-only workarounds
4. ✅ Run integration tests: `pnpm vitest run --project integration tests/integration --shard 1/4`
5. ✅ Run e2e tests: `pnpm vitest run --project e2e tests/e2e --shard 1/4`
6. ✅ Verify RLS tests pass: `pnpm vitest run tests/integration/rls`
7. ✅ Run full CI locally: `pnpm local-ci:main`

## Additional Notes

### Why This Wasn't Caught Earlier

- The postgres user in CI has BYPASSRLS, so direct queries work
- Service-role DB is used in most tests, bypassing RLS
- RLS-enforced clients are only used in actual request handlers
- Tests that mock the DB don't hit this issue

### Related Issues

- Multiple recent commits attempted to fix "failing tests"
- Commits show pattern of adding service-role DB usage in tests
- This is treating symptoms, not the root cause

### References

- PostgreSQL RLS Documentation: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Neon RLS Guide: https://neon.com/docs/guides/rls-tutorial
- Supabase RLS Testing: https://supabase.com/docs/guides/database/postgres/row-level-security
- Best practice: Never test with superuser or BYPASSRLS roles

---

**Next Steps**: Implement fixes in order listed above, test thoroughly, and delete this file once all tests pass.
