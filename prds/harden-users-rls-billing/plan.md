# Implementation Plan: Harden users_update_own RLS for Billing Fields

**Parent Issue:** [#297](https://github.com/saldanaj97/atlaris/issues/297)
**Slice Issues:** [#299](https://github.com/saldanaj97/atlaris/issues/299) (migration + bootstrap), [#300](https://github.com/saldanaj97/atlaris/issues/300) (tests + docs)
**Research:** [research.md](./research.md)

---

## Problem

The `users_update_own` RLS policy on the `users` table allows the `authenticated` role to UPDATE **all columns** on their own row. This includes billing/system-managed columns that should only be writable by the service-role (used by Stripe webhooks and background workers). While current API routes restrict fields via Zod validation, there is no database-layer enforcement — a missed route or future refactor could expose billing field tampering.

## Solution

Use PostgreSQL **column-level GRANT/REVOKE** to restrict the `authenticated` role to only UPDATE three columns: `name`, `preferred_ai_model`, and `updated_at`. The service-role (`postgres` with BYPASSRLS) is the table owner and is unaffected by column-level REVOKE on other roles.

---

## Slice 1: Migration + Bootstrap (Issue #299)

### Step 1.0 — Fetch the issue and confirm acceptance criteria

Before writing any code, fetch the issue to get the authoritative acceptance criteria:

```bash
GH_PAGER= gh issue view 299
```

Verify the issue body contains acceptance criteria. The expected ACs for this slice are:

1. Migration `0018_harden_users_update_columns.sql` exists with `REVOKE UPDATE` + `GRANT UPDATE (name, preferred_ai_model, updated_at)` for `authenticated` role
2. `tests/helpers/db.ts` applies matching column-level grants after table-level grants
3. `tests/setup/testcontainers.ts` applies matching column-level grants
4. `.github/workflows/ci-trunk.yml` E2E and Integration grant steps include column-level grants
5. Existing user-facing routes (`/api/v1/user/profile`, `/api/v1/user/preferences`) continue to work
6. Stripe webhook billing writes (service-role) are unaffected

If the issue is missing acceptance criteria, add them with:
```bash
GH_PAGER= gh issue edit 299 --body "$(GH_PAGER= gh issue view 299 --json body -q .body)

## Acceptance criteria
- [ ] Migration 0018_harden_users_update_columns.sql exists with REVOKE/GRANT
- [ ] tests/helpers/db.ts applies matching column-level grants
- [ ] tests/setup/testcontainers.ts applies matching column-level grants
- [ ] ci-trunk.yml E2E and Integration grant steps include column-level grants
- [ ] Existing user-facing routes still work
- [ ] Stripe webhook billing writes (service-role) are unaffected"
```

### Step 1.1 — Create the migration SQL file

**Create file:** `src/lib/db/migrations/0018_harden_users_update_columns.sql`

**Exact content:**
```sql
-- Restrict authenticated role to only update user-editable columns.
-- Service-role (postgres/owner with BYPASSRLS) is unaffected.
REVOKE UPDATE ON "users" FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
```

**Notes:**
- The `--> statement-breakpoint` marker is the Drizzle migration convention for separating statements (see `0017_cancel_at_period_end_drop_plan_generations.sql` for the pattern).
- Column names must use the **SQL snake_case** names, not the JS camelCase names.
- `updated_at` must be included because both `/api/v1/user/profile` and `/api/v1/user/preferences` set it during updates.

### Step 1.2 — Register the migration in the journal

**Edit file:** `src/lib/db/migrations/meta/_journal.json`

Add a new entry **at the end of the `entries` array**, after the existing entry with `idx: 17`. The new entry:

```json
{
  "idx": 18,
  "version": "7",
  "when": 1771200000000,
  "tag": "0018_harden_users_update_columns",
  "breakpoints": true
}
```

**Exact edit:** In `_journal.json`, find the closing `}` of the `idx: 17` entry (approximately line 129) and add a comma after it, then insert the new entry before the closing `]`.

The result should look like:
```json
    {
      "idx": 17,
      "version": "7",
      "when": 1771150000000,
      "tag": "0017_cancel_at_period_end_drop_plan_generations",
      "breakpoints": true
    },
    {
      "idx": 18,
      "version": "7",
      "when": 1771200000000,
      "tag": "0018_harden_users_update_columns",
      "breakpoints": true
    }
  ]
}
```

### Step 1.3 — Update `tests/helpers/db.ts`

**Edit file:** `tests/helpers/db.ts`

**Where:** After line 160 (the existing table-level `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` block), add a new `db.execute()` call that applies the column-level restriction.

**Insert after line 161 (the closing `});` of the table-level GRANT):**

```typescript
  // Restrict authenticated role to user-editable columns on users table.
  // Matches migration 0018_harden_users_update_columns.sql.
  await db.execute(sql`
    REVOKE UPDATE ON "users" FROM authenticated;
    GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
  `);
```

**Exact insertion point — the file currently reads:**
```typescript
  // Grant table permissions to authenticated role
  await db.execute(sql`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `);

  // Grant read-only permissions to anonymous role
```

**After the edit, it should read:**
```typescript
  // Grant table permissions to authenticated role
  await db.execute(sql`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  `);

  // Restrict authenticated role to user-editable columns on users table.
  // Matches migration 0018_harden_users_update_columns.sql.
  await db.execute(sql`
    REVOKE UPDATE ON "users" FROM authenticated;
    GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
  `);

  // Grant read-only permissions to anonymous role
```

### Step 1.4 — Update `tests/setup/testcontainers.ts`

**Edit file:** `tests/setup/testcontainers.ts`

**Where:** Inside the `grantRlsPermissions()` function, after line 103 (the closing of the first `sql.unsafe()` call that grants table permissions), add a new `sql.unsafe()` call.

**The file currently reads (lines 97-105):**
```typescript
  try {
    // Table permissions for authenticated role
    await sql.unsafe(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anonymous;
    `);

    // Default privileges for future tables
```

**After the edit, it should read:**
```typescript
  try {
    // Table permissions for authenticated role
    await sql.unsafe(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anonymous;
    `);

    // Restrict authenticated role to user-editable columns on users table.
    // Matches migration 0018_harden_users_update_columns.sql.
    await sql.unsafe(`
      REVOKE UPDATE ON "users" FROM authenticated;
      GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
    `);

    // Default privileges for future tables
```

### Step 1.5 — Update `.github/workflows/ci-trunk.yml` (TWO locations)

**Edit file:** `.github/workflows/ci-trunk.yml`

There are **two identical grant blocks** — one for E2E tests (~line 147) and one for Integration tests (~line 348). Both must be updated identically.

**Location 1 — E2E tests (after line 153):**

The file currently reads (lines 147-160):
```yaml
          psql -h localhost -p 5432 -U postgres -d "${{ env.DB_NAME }}" -v ON_ERROR_STOP=1 <<'SQL'
          GRANT USAGE ON SCHEMA public TO authenticated;
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
          GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
          SQL

          # Grant read-only permissions to anonymous role
```

After the edit:
```yaml
          psql -h localhost -p 5432 -U postgres -d "${{ env.DB_NAME }}" -v ON_ERROR_STOP=1 <<'SQL'
          GRANT USAGE ON SCHEMA public TO authenticated;
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
          GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
          SQL

          # Restrict authenticated role to user-editable columns on users table (matches migration 0018)
          psql -h localhost -p 5432 -U postgres -d "${{ env.DB_NAME }}" -v ON_ERROR_STOP=1 <<'SQL'
          REVOKE UPDATE ON "users" FROM authenticated;
          GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
          SQL

          # Grant read-only permissions to anonymous role
```

**Location 2 — Integration tests (after line 354):**

Apply the **exact same insertion** after the Integration tests' authenticated role grant block (lines 348-354). The SQL content and YAML indentation are identical to Location 1.

---

## Slice 2: Security Tests + Documentation (Issue #300)

### Step 2.0 — Fetch the issue and confirm acceptance criteria

Before writing any code, fetch the issue to get the authoritative acceptance criteria:

```bash
GH_PAGER= gh issue view 300
```

Verify the issue body contains acceptance criteria. The expected ACs for this slice are:

1. Test: authenticated user CANNOT update `cancel_at_period_end` on own row
2. Test: authenticated user CANNOT update `stripe_customer_id` on own row
3. Test: authenticated user CANNOT update `subscription_status` on own row
4. Test: authenticated user CAN update `name` on own row
5. Test: authenticated user CAN update `preferred_ai_model` on own row
6. Schema comment in `users.ts` updated to reflect DB-layer enforcement
7. `docs/technical-debt.md` documents the column-level security pattern
8. All existing tests continue to pass

If the issue is missing acceptance criteria, add them with:
```bash
GH_PAGER= gh issue edit 300 --body "$(GH_PAGER= gh issue view 300 --json body -q .body)

## Acceptance criteria
- [ ] Test: authenticated user CANNOT update cancel_at_period_end
- [ ] Test: authenticated user CANNOT update stripe_customer_id
- [ ] Test: authenticated user CANNOT update subscription_status
- [ ] Test: authenticated user CAN update name
- [ ] Test: authenticated user CAN update preferred_ai_model
- [ ] Schema comment in users.ts reflects DB-layer enforcement
- [ ] docs/technical-debt.md documents the column-level security pattern
- [ ] All existing tests pass"
```

### Step 2.1 — Add column-level security tests

**Edit file:** `tests/security/rls.policies.spec.ts`

**Where:** Insert a new test immediately after line 373 (the closing `});` of the `'authenticated users can read and update only their own user row'` test) and before line 375 (the `'authenticated users can read their own learning plans'` test).

**Insert this exact code block:**

```typescript

    it('authenticated users cannot update billing/system-managed columns on their own row', async () => {
      const [user] = await db
        .insert(users)
        .values({
          authUserId: 'user_billing_guard',
          email: 'billing-guard@test.com',
          name: 'Billing Guard User',
        })
        .returning();

      const userDb = await createRlsDbForUser('user_billing_guard');

      // Attempt to update cancelAtPeriodEnd — should fail with column privilege error
      await expect(
        userDb
          .update(users)
          .set({ cancelAtPeriodEnd: true } as any)
          .where(eq(users.id, user.id))
      ).rejects.toThrow(/permission denied/i);

      // Attempt to update stripeCustomerId — should fail with column privilege error
      await expect(
        userDb
          .update(users)
          .set({ stripeCustomerId: 'cus_fake123' } as any)
          .where(eq(users.id, user.id))
      ).rejects.toThrow(/permission denied/i);

      // Attempt to update subscriptionStatus — should fail with column privilege error
      await expect(
        userDb
          .update(users)
          .set({ subscriptionStatus: 'active' } as any)
          .where(eq(users.id, user.id))
      ).rejects.toThrow(/permission denied/i);

      // Verify user-editable columns STILL work
      const updated = await userDb
        .update(users)
        .set({ name: 'Updated Name' })
        .where(eq(users.id, user.id))
        .returning({ id: users.id, name: users.name });

      expect(updated).toHaveLength(1);
      expect(updated[0]?.name).toBe('Updated Name');
    });
```

**Why `as any`:** Drizzle's TypeScript types won't prevent `.set({ cancelAtPeriodEnd: true })` from compiling since it's a valid column on the table. But we need to assert the DB rejects it. The `as any` is used because the test intentionally exercises an update that should be blocked at the database level, and some Drizzle type configurations might complain. If Drizzle types allow it without `as any`, remove the cast.

**Error pattern:** When PostgreSQL denies a column-level UPDATE, it throws: `ERROR: permission denied for table users` or `permission denied for relation users`. The `/permission denied/i` regex matches both.

### Step 2.2 — Update schema comment in `users.ts`

**Edit file:** `src/lib/db/schema/tables/users.ts`

**Replace lines 66-68:**
```typescript
    // Users can update only their own profile fields
    // Note: Application-level validation should restrict which fields
    // users can modify (e.g., name is OK, stripe fields are not)
```

**With:**
```typescript
    // Users can update only their own profile fields.
    // Column-level privileges (migration 0018) restrict the authenticated
    // role to: name, preferred_ai_model, updated_at. Billing and system
    // columns are only writable by the service-role (BYPASSRLS).
```

### Step 2.3 — Add entry to `docs/technical-debt.md`

**Edit file:** `docs/technical-debt.md`

**Append at the end of the file (after line 83):**

```markdown

## `users` table column-level UPDATE grant

Migration `0018_harden_users_update_columns.sql` restricts the `authenticated`
role to only UPDATE `name`, `preferred_ai_model`, and `updated_at` on the
`users` table. All other columns (billing, system-managed) are only writable by
the service-role which has BYPASSRLS.

When adding new user-editable columns to the `users` table, the column-level
GRANT must be updated in **four locations**:

1. A new migration SQL file extending the GRANT list
2. `tests/helpers/db.ts` — `ensureRlsRolesAndPermissions()`
3. `tests/setup/testcontainers.ts` — `grantRlsPermissions()`
4. `.github/workflows/ci-trunk.yml` — both E2E and Integration grant blocks

Failure to update these will cause the new column to be unwritable by
authenticated users (caught by existing RLS tests failing).
```

---

## Validation Steps

After all changes are made, run these commands to verify nothing is broken:

### 1. Type check
```bash
pnpm type-check
```
Expected: passes (no schema changes, only SQL and comments)

### 2. Lint
```bash
pnpm lint
```
Expected: passes

### 3. Run changed tests
```bash
pnpm test:changed
```
Expected: passes (picks up rls.policies.spec.ts changes)

### 4. Run full RLS test suite (if local Postgres is available)
```bash
RUN_RLS_TESTS=1 pnpm vitest run tests/security/rls.policies.spec.ts
```
Expected: new billing column protection test passes alongside existing tests

**Note:** RLS tests require a running PostgreSQL with testcontainers or `docker-compose.test.yml`. If not available locally, CI will run them.

---

## Issue Verification & Closure

After all validation steps pass, verify each slice's acceptance criteria are met, then close the issues.

### Verify Slice 1 (#299) acceptance criteria

Walk through each AC and confirm it is satisfied:

| # | Acceptance Criteria | How to Verify |
|---|---|---|
| 1 | Migration file exists with REVOKE/GRANT | `cat src/lib/db/migrations/0018_harden_users_update_columns.sql` — confirm it contains `REVOKE UPDATE ON "users" FROM authenticated` and `GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated` |
| 2 | `tests/helpers/db.ts` has matching grants | `grep -A3 'REVOKE UPDATE' tests/helpers/db.ts` — confirm REVOKE + GRANT present |
| 3 | `tests/setup/testcontainers.ts` has matching grants | `grep -A3 'REVOKE UPDATE' tests/setup/testcontainers.ts` — confirm REVOKE + GRANT present |
| 4 | CI workflow has matching grants (2 locations) | `grep -c 'REVOKE UPDATE' .github/workflows/ci-trunk.yml` — confirm count is 2 |
| 5 | User-facing routes still work | `pnpm type-check` passes (routes reference same Drizzle schema, no breaking changes) |
| 6 | Service-role unaffected | Service-role uses `postgres` owner with BYPASSRLS — column REVOKE on `authenticated` does not apply. Confirm by reviewing that no service-role code was changed. |

Once confirmed, close the issue:
```bash
GH_PAGER= gh issue close 299 --comment "Implemented: migration 0018 with column-level REVOKE/GRANT, test bootstrap and CI grants updated in lockstep. All validation steps pass."
```

### Verify Slice 2 (#300) acceptance criteria

| # | Acceptance Criteria | How to Verify |
|---|---|---|
| 1-3 | Tests: billing columns blocked | `grep -c 'permission denied' tests/security/rls.policies.spec.ts` — confirm 3 assertions for `cancelAtPeriodEnd`, `stripeCustomerId`, `subscriptionStatus` |
| 4-5 | Tests: user-editable columns work | `grep 'Updated Name' tests/security/rls.policies.spec.ts` — confirm positive assertion exists |
| 6 | Schema comment updated | `grep 'migration 0018' src/lib/db/schema/tables/users.ts` — confirm new comment references column-level privileges |
| 7 | Technical debt documented | `grep 'column-level UPDATE grant' docs/technical-debt.md` — confirm section exists |
| 8 | All tests pass | `pnpm test:changed` and `pnpm lint` pass |

Once confirmed, close the issue:
```bash
GH_PAGER= gh issue close 300 --comment "Implemented: security tests proving billing column restriction, schema comment and technical-debt.md updated. All tests pass."
```

### Close parent issue (#297)

After both slice issues are closed, close the parent:
```bash
GH_PAGER= gh issue close 297 --comment "Resolved via #299 (column-level GRANT migration + bootstrap) and #300 (security tests + documentation). All 5 acceptance criteria met:
1. ✅ users_update_own no longer allows broad billing column updates
2. ✅ Billing field writes restricted to service-role (BYPASSRLS)
3. ✅ User-editable fields (name, preferred_ai_model) have supported update path
4. ✅ Tests verify authenticated user cannot mutate billing fields
5. ✅ Enforcement approach documented in schema comment and technical-debt.md"
```

---

## File Change Summary

| File | Action | Slice |
|------|--------|-------|
| `src/lib/db/migrations/0018_harden_users_update_columns.sql` | **CREATE** | #299 |
| `src/lib/db/migrations/meta/_journal.json` | **EDIT** — add idx 18 entry | #299 |
| `tests/helpers/db.ts` | **EDIT** — add REVOKE/GRANT after line 161 | #299 |
| `tests/setup/testcontainers.ts` | **EDIT** — add REVOKE/GRANT after line 103 | #299 |
| `.github/workflows/ci-trunk.yml` | **EDIT** — add REVOKE/GRANT at 2 locations (after lines 153 and 354) | #299 |
| `tests/security/rls.policies.spec.ts` | **EDIT** — add test after line 373 | #300 |
| `src/lib/db/schema/tables/users.ts` | **EDIT** — replace comment at lines 66-68 | #300 |
| `docs/technical-debt.md` | **EDIT** — append new section after line 83 | #300 |

---

## Commit Strategy

**Slice 1 commit:**
```
fix: enforce column-level UPDATE privileges on users table

Restrict the authenticated role to only UPDATE name, preferred_ai_model,
and updated_at on the users table. Billing and system-managed columns are
now only writable by the service-role (BYPASSRLS).

Changes:
- Add migration 0018_harden_users_update_columns.sql with REVOKE/GRANT
- Update test DB bootstrap (db.ts, testcontainers.ts) to match migration
- Update CI grant steps (ci-trunk.yml) for E2E and Integration tests
```

**Slice 2 commit:**
```
test: add security tests and docs for column-level user restrictions

Verify that authenticated users cannot update billing columns and document
the column-level security pattern for future maintainers.

Changes:
- Add billing column protection test in rls.policies.spec.ts
- Update schema comment in users.ts to reflect DB-layer enforcement
- Add technical-debt.md entry documenting the GRANT update pattern
```

---

## Gotchas and Edge Cases

1. **Do NOT use `REVOKE ALL` — only `REVOKE UPDATE`.** SELECT, INSERT, DELETE must remain at the table level for the authenticated role.

2. **Column names are snake_case in SQL.** The migration uses `preferred_ai_model` (not `preferredAiModel`), `updated_at` (not `updatedAt`), etc.

3. **The REVOKE must come before the GRANT.** `REVOKE UPDATE ON "users" FROM authenticated` removes the table-level UPDATE privilege, then `GRANT UPDATE (col1, col2, col3)` adds back column-specific privileges.

4. **Service-role is NOT affected.** The `postgres` role is the table owner and has BYPASSRLS. Column-level REVOKE on the `authenticated` role does not affect the owner.

5. **The `--> statement-breakpoint` marker** in the migration file is a Drizzle convention for multi-statement migrations. Place it after the REVOKE line.

6. **RLS tests only run when `CI=true` or `RUN_RLS_TESTS=1`.** This is controlled by `shouldRunRlsTests()` at line 39 of `rls.policies.spec.ts`. In CI, this is always enabled.

7. **The `as any` cast in tests** is needed because we're intentionally setting billing columns that TypeScript knows are valid Drizzle columns, but the database should reject them. Without `as any`, Drizzle types would happily accept the `.set()` call — we want the **database** to reject it, not TypeScript.

8. **Four locations must stay in sync.** The REVOKE/GRANT must be identical in: the migration file, `tests/helpers/db.ts`, `tests/setup/testcontainers.ts`, and `.github/workflows/ci-trunk.yml` (×2 blocks). If they drift, test environments won't match production.
