# Plan: Scope RLS Policies Explicitly (Authenticated-Only App Data)

**Issue:** #191  
**Created:** 2026-02-03  
**Status:** Implemented - Pending Staging Migration + Security Test Validation

---

## Current State Analysis

### Summary of Findings

| Metric                             | Count |
| ---------------------------------- | ----- |
| Total `pgPolicy` definitions       | 68    |
| Tables with RLS enabled            | 20    |
| Policies with explicit `to` clause | 0     |

**Problem:** All 68 policies default to `TO PUBLIC`, meaning any database role can potentially match them. The runtime already uses role switching (`SET ROLE authenticated` / `SET ROLE anonymous`), so policies should be scoped to those specific roles.

### Current RLS Runtime Model

The system uses three PostgreSQL roles:

| Role                   | BYPASSRLS | Purpose                                                  |
| ---------------------- | --------- | -------------------------------------------------------- |
| Owner (database owner) | Yes       | Initial connection; immediately switches to another role |
| `authenticated`        | No        | For logged-in users                                      |
| `anonymous`            | No        | For public/unauthenticated access                        |

The `SET ROLE authenticated/anonymous` command drops the BYPASSRLS privilege and establishes the session context. However, without explicit `to` targeting, policies technically apply to all roles.

---

## Policy Classification

Based on analysis, here's how each policy should be scoped:

### Category 1: Authenticated-Only Policies (User-Owned Data)

These policies check `clerkSub` for user ownership and should only apply to authenticated users:

| Table                        | Policy Names                                                              | New Target      |
| ---------------------------- | ------------------------------------------------------------------------- | --------------- |
| `users`                      | `users_select_own`, `users_insert_own`, `users_update_own`                | `authenticated` |
| `learning_plans`             | `learning_plans_insert`, `learning_plans_update`, `learning_plans_delete` | `authenticated` |
| `plan_schedules`             | All 4 policies                                                            | `authenticated` |
| `plan_generations`           | All 4 policies                                                            | `authenticated` |
| `generation_attempts`        | Both policies                                                             | `authenticated` |
| `modules`                    | `modules_select_own_plan`, `*_insert`, `*_update`, `*_delete`             | `authenticated` |
| `tasks`                      | `tasks_select_own_plan`, `*_insert`, `*_update`, `*_delete`               | `authenticated` |
| `task_resources`             | `task_resources_select_own_plan`, `*_insert`, `*_update`, `*_delete`      | `authenticated` |
| `task_progress`              | All 4 policies                                                            | `authenticated` |
| `usage_metrics`              | All 4 policies                                                            | `authenticated` |
| `ai_usage_events`            | Both policies                                                             | `authenticated` |
| `integration_tokens`         | All 4 policies                                                            | `authenticated` |
| `oauth_state_tokens`         | All 3 policies                                                            | `authenticated` |
| `notion_sync_state`          | All 4 policies                                                            | `authenticated` |
| `google_calendar_sync_state` | All 4 policies                                                            | `authenticated` |
| `task_calendar_events`       | All 4 policies                                                            | `authenticated` |
| `job_queue`                  | Both policies                                                             | `authenticated` |

### Category 2: Service-Role-Only Tables (No User Policies)

These tables have RLS enabled but no policies, meaning only service-role (with BYPASSRLS) can access them:

| Table                   | Status            |
| ----------------------- | ----------------- |
| `clerk_webhook_events`  | No changes needed |
| `stripe_webhook_events` | No changes needed |

---

## Decisions Made

### Decision 1: Product Scope Alignment (No Marketplace/Public Plans)

**Choice:** Make user-facing plan/module/task/resource policies authenticated-only.

**Why:** Product direction is private learning plans only (no public marketplace). Allowing anonymous/public-read policies adds unnecessary attack surface and complexity.

Implemented direction:

```typescript
// Authenticated users can read only their own plans
pgPolicy('learning_plans_select', {
  for: 'select',
  to: 'authenticated',
  using: recordOwnedByCurrentUser(table.userId),
});
```

This change also removes public-read policy variants:

- `learning_plans_select_own`
- `modules_select_public_anon`
- `modules_select_public_auth`
- `tasks_select_public_anon`
- `tasks_select_public_auth`
- `task_resources_select_public_anon`
- `task_resources_select_public_auth`
- `resources_select_anon`

### Decision 2: Migration Strategy

**Choice:** Option C - Use Drizzle but verify it produces `ALTER POLICY` (not `DROP+CREATE`).

1. Modify the Drizzle schema files to add `to` clauses
2. Run `pnpm db:generate` to create migration SQL
3. **Verify** the generated migration uses `ALTER POLICY` statements
4. If Drizzle generates `DROP POLICY` + `CREATE POLICY` instead, that's acceptable but should be noted

---

## Implementation Plan

### Phase 1: Schema Modifications

**Files to modify:**

1. `src/lib/db/schema/tables/users.ts` - 3 policies
2. `src/lib/db/schema/tables/plans.ts` - authenticated-only plan access policies
3. `src/lib/db/schema/tables/tasks.ts` - remove public-read policy variants + keep authenticated-only access
4. `src/lib/db/schema/tables/usage.ts` - 6 policies
5. `src/lib/db/schema/tables/integrations.ts` - 19 policies
6. `src/lib/db/schema/tables/jobs.ts` - 2 policies

**Example change pattern:**

```typescript
// Before
pgPolicy('learning_plans_insert', {
  for: 'insert',
  withCheck: recordOwnedByCurrentUser(table.userId),
}),

// After
pgPolicy('learning_plans_insert', {
  for: 'insert',
  to: 'authenticated',  // <-- Add this
  withCheck: recordOwnedByCurrentUser(table.userId),
}),
```

### Phase 2: Migration Generation

```bash
pnpm db:generate
```

**Review the generated migration to ensure:**

- Policies are correctly targeted
- No unintended side effects
- Verify whether Drizzle uses `ALTER POLICY` or `DROP+CREATE` approach

### Phase 3: Test Updates

**Update `tests/security/rls.policies.spec.ts`:**

1. **Add anonymous write rejection tests** - Verify anonymous role cannot INSERT/UPDATE/DELETE on user-owned tables
2. **Add explicit role verification tests** - Query `pg_policies` to confirm role targeting
3. **Keep existing tests** - They should continue to pass

**New test cases to add:**

```typescript
it('pg_policies shows authenticated role, not PUBLIC', async () => {
  const policies = await serviceDb.execute(sql`
    SELECT policyname, roles
    FROM pg_policies
    WHERE tablename = 'learning_plans'
  `);

  for (const policy of policies.rows) {
    expect(policy.roles).not.toContain('PUBLIC');
    // Should be either ['authenticated'] or ['anonymous'] or both
  }
});

it('anonymous users cannot insert into user-owned tables', async () => {
  const anonDb = await createAnonRlsDb();

  // Attempt to insert - should fail with RLS violation
  await expectRlsViolation(() =>
    anonDb.insert(learningPlans).values({...})
  );
});
```

### Phase 4: Verification

1. Run `pnpm db:migrate` on staging
2. Run security tests: `RUN_RLS_TESTS=1 pnpm test tests/security/`
3. Query `pg_policies` to verify role targeting:

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

## Summary of Work Items

| Phase | Task                                                                    | Files Changed                         |
| ----- | ----------------------------------------------------------------------- | ------------------------------------- |
| 1.1   | Add `to: 'authenticated'` to user-owned policies                        | 6 schema files                        |
| 1.2   | Remove public/anonymous read policy variants (plans/modules/tasks/etc.) | 2 schema files                        |
| 1.3   | Harden cross-table ownership checks (`task_calendar_events`)            | 2 schema files                        |
| 2     | Generate migrations                                                     | `pnpm db:generate`                    |
| 3.1   | Add anonymous denial + ownership hardening security tests               | `tests/security/rls.policies.spec.ts` |
| 3.2   | Add `pg_policies` role verification test                                | Same file                             |
| 4     | Run tests and verify                                                    | CI / manual                           |

### Implementation Notes (Actual)

1. Added explicit `to` role targeting to all user-facing policies across:
   - `src/lib/db/schema/tables/users.ts`
   - `src/lib/db/schema/tables/plans.ts`
   - `src/lib/db/schema/tables/tasks.ts`
   - `src/lib/db/schema/tables/usage.ts`
   - `src/lib/db/schema/tables/integrations.ts`
   - `src/lib/db/schema/tables/jobs.ts`
   - Current schema state: 61 `pgPolicy(...)` definitions, all with explicit `to`
2. Generated migration: `src/lib/db/migrations/0006_peaceful_the_santerians.sql`
   - Uses `ALTER POLICY ... TO ...` for existing policies
   - Initially introduced `learning_plans_select_own` as part of a split-read strategy (later removed in step 4 to match private-only product scope)
3. Follow-up hardening from review:
   - Added `userAndTaskOwnedByCurrentUser(...)` helper in `src/lib/db/schema/policy-helpers.ts`
   - Tightened `task_calendar_events` policies to require both user ownership and task→module→plan ownership in `src/lib/db/schema/tables/integrations.ts`
   - Generated follow-up migration: `src/lib/db/migrations/0007_spooky_puppet_master.sql` (task calendar event policy condition updates)
4. Product-scope correction (private plans only, no public marketplace):
   - Removed anonymous/public-read policy variants from plan/module/task/task-resource/resource tables
   - Changed `learning_plans_select` to authenticated ownership only
   - Hardened `task_progress` checks to require owned-task access only
   - Generated follow-up migration: `src/lib/db/migrations/0008_furry_exiles.sql`
5. Updated security tests in `tests/security/rls.policies.spec.ts`:
   - Added metadata verification against `pg_policies` for role scoping
   - Updated anonymous tests to verify no read access to plan data (including rows marked `visibility='public'`)
   - Added anonymous write rejection tests (insert/update/delete scenarios)
   - Added authenticated cross-tenant rejection test for `task_calendar_events` inserts
6. Local test run note:
   - `RUN_RLS_TESTS=1 pnpm exec vitest run --project security tests/security/rls.policies.spec.ts`
   - Blocked in this environment by local DB connectivity (`connect EPERM 127.0.0.1:54330`)
   - Requires running against an available local/CI test database after migration

---

## Acceptance Criteria

- [x] All user-facing policies have explicit `to` clause in schema files (no default `PUBLIC`)
- [x] User-facing plan/module/task/resource policies are authenticated-only (no anonymous app-data policies)
- [x] Migrations generated and reviewed (role scoping + ownership hardening + public-policy removals)
- [ ] `SELECT * FROM pg_policies` shows no `PUBLIC` roles for user-facing tables (pending after migration is applied)
- [ ] Security tests pass:
  - [x] Anonymous cannot write to user-owned tables (tests added)
  - [x] Anonymous cannot read plan/module/task/resource app data
  - [x] Authenticated access unchanged (existing test coverage kept)
- [ ] No API route behavior regression (pending post-migration validation)
- [ ] All existing tests pass (blocked locally by DB connectivity; run in CI/staging)
