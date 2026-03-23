# Preliminary Research: Harden users_update_own RLS for Billing Fields

**Issue:** [#297](https://github.com/saldanaj97/atlaris/issues/297)
**Status:** Research complete, ready for implementation planning

---

## 1. Problem Statement

The `users_update_own` RLS policy in `src/lib/db/schema/tables/users.ts` (line 69-74) allows any authenticated user to UPDATE **all columns** on their own `users` row. While row-level isolation works correctly (users can only modify their own record), there is no column-level restriction. This means billing/system-managed fields — `cancelAtPeriodEnd`, `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `subscriptionPeriodEnd`, `monthlyExportCount` — are writable by any authenticated user at the database layer.

Currently, application-level validation (Zod schemas on API routes) restricts which fields users can update. But this is a defense-in-depth gap: a missed API path, future refactor, or client misuse could allow billing field tampering.

---

## 2. Current State Analysis

### 2.1 Users Table Schema

**File:** `src/lib/db/schema/tables/users.ts`

| Column | Type | Category |
|--------|------|----------|
| `id` | uuid (PK) | System |
| `authUserId` | text (unique) | System |
| `email` | text (unique) | System |
| `name` | text (nullable) | **User-editable** |
| `subscriptionTier` | enum ('free','starter','pro') | Billing |
| `stripeCustomerId` | text (unique, nullable) | Billing |
| `stripeSubscriptionId` | text (unique, nullable) | Billing |
| `subscriptionStatus` | enum (nullable) | Billing |
| `subscriptionPeriodEnd` | timestamptz (nullable) | Billing |
| `cancelAtPeriodEnd` | boolean | Billing |
| `monthlyExportCount` | integer | System-managed |
| `preferredAiModel` | enum (nullable) | **User-editable** |
| `createdAt` | timestamptz | System |
| `updatedAt` | timestamptz | Bookkeeping |

**User-editable columns:** `name`, `preferredAiModel`, `updatedAt`
**Billing/system-managed columns (must be restricted):** `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `subscriptionPeriodEnd`, `cancelAtPeriodEnd`, `monthlyExportCount`, `subscriptionTier`
**Immutable system columns:** `id`, `authUserId`, `email`, `createdAt`

### 2.2 RLS Policies on Users Table

**File:** `src/lib/db/schema/tables/users.ts` (lines 43-79)

| Policy | Operation | Role | Clause |
|--------|-----------|------|--------|
| `users_select_own` | SELECT | authenticated | `USING (authUserId = current_user_id)` |
| `users_insert_own` | INSERT | authenticated | `WITH CHECK (authUserId = current_user_id)` |
| `users_update_own` | UPDATE | authenticated | `USING + WITH CHECK (authUserId = current_user_id)` |

**Critical comment at line 67-68:**
> "Users can update only their own profile fields. Note: Application-level validation should restrict which fields users can modify (e.g., name is OK, stripe fields are not)"

This comment explicitly acknowledges the gap that issue #297 aims to close.

### 2.3 User Update API Routes (Application-Level Validation)

| Route | Method | Fields Updated | Connection |
|-------|--------|---------------|------------|
| `/api/v1/user/profile` | PUT | `name` only (strict Zod) | RLS (`getDb()`) |
| `/api/v1/user/preferences` | PATCH | `preferredAiModel` only (strict Zod) | RLS (`getDb()`) |
| `/api/v1/user/subscription` | GET | Read-only | RLS |

**Application validation is correct and tight** — no user-facing route exposes billing field writes. The risk is future routes or code paths bypassing this validation.

### 2.4 DB Query Functions

**File:** `src/lib/db/queries/users.ts`

| Function | Operation | Fields | Connection |
|----------|-----------|--------|------------|
| `createUser()` | INSERT | All initial fields | RLS or service-role |
| `getUserByAuthId()` | SELECT | Read-only | RLS or service-role |
| `updateUserPreferredAiModel()` | UPDATE | `preferredAiModel`, `updatedAt` | RLS (default) |

No query function in this file updates billing columns — that happens in billing-specific code.

### 2.5 Billing/System-Managed Writes (Service-Role)

**File:** `src/features/billing/subscriptions.ts`

| Function | Fields Updated | Connection |
|----------|---------------|------------|
| `syncSubscriptionToDb()` (line 93) | `subscriptionTier`, `stripeSubscriptionId`, `subscriptionStatus`, `subscriptionPeriodEnd`, `cancelAtPeriodEnd`, `updatedAt` | **Service-role (BYPASSRLS)** ✅ |
| `createCustomer()` (line 221) | `stripeCustomerId` | **Service-role (BYPASSRLS)** ✅ |

**File:** `src/app/api/v1/stripe/webhook/route.ts`

| Event | Fields Updated | Connection |
|-------|---------------|------------|
| `customer.subscription.updated` (line 186) | Via `syncSubscriptionToDb()` | Service-role ✅ |
| `customer.subscription.deleted` (line 213) | `subscriptionTier`, `subscriptionStatus`, `stripeSubscriptionId`, `subscriptionPeriodEnd`, `cancelAtPeriodEnd`, `updatedAt` | Service-role ✅ |
| `invoice.payment_failed` (line 248) | `subscriptionStatus`, `updatedAt` | Service-role ✅ |

**All billing writes already use service-role (BYPASSRLS).** Column-level restrictions on the `authenticated` role will NOT break these paths.

---

## 3. Permission Architecture

### 3.1 Current GRANT/REVOKE State

**Table-level grants only — no column-level grants exist anywhere.**

Locations where grants are applied:

| Location | Grants |
|----------|--------|
| `.github/workflows/ci-trunk.yml` (lines 147-160) | `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated` |
| `tests/helpers/db.ts` (lines 150-187) | Same as CI + `ALTER DEFAULT PRIVILEGES` |
| `tests/setup/testcontainers.ts` (lines 94-120) | Same pattern |

### 3.2 Role Architecture

| Role | BYPASSRLS | Usage |
|------|-----------|-------|
| `postgres` (owner) | ✅ | Migrations, service-role client |
| `authenticated` | ❌ | User-facing requests via `SET ROLE` |
| `anonymous` | ❌ | Public/unauthenticated endpoints |
| `neondb_owner` | ❌ (NOINHERIT) | Neon internal |

**RLS enforcement pattern:** Owner role connects → `SET ROLE authenticated` → sets `request.jwt.claims` session variable → RLS policies check `authUserId = current_user_id`.

### 3.3 Drizzle ORM Limitation

**Drizzle's `pgPolicy` API has no column-restriction support.** The `PgPolicyConfig` interface only supports `as`, `for`, `to`, `using`, and `withCheck`. Column-level write restrictions must use raw SQL `GRANT`/`REVOKE` in migrations.

---

## 4. Proposed Approach

### Strategy: PostgreSQL Column-Level Privileges

**Approach:** Use `REVOKE UPDATE` then `GRANT UPDATE` on specific columns for the `authenticated` role.

```sql
-- Step 1: Revoke broad UPDATE from authenticated
REVOKE UPDATE ON users FROM authenticated;

-- Step 2: Grant UPDATE only on user-editable columns
GRANT UPDATE (name, preferred_ai_model, updated_at) ON users TO authenticated;
```

**Why this works:**
- The `authenticated` role loses ability to update billing columns
- Service-role (`postgres` with BYPASSRLS) is unaffected — it owns the table
- Row-level RLS policy `users_update_own` remains unchanged (still enforces row ownership)
- Existing API routes continue working (they only update `name` or `preferredAiModel`)

### Why NOT other approaches:

| Alternative | Why Not |
|-------------|---------|
| New RLS policy with column checks | RLS USING/WITH CHECK can't restrict *which columns* are modified, only *which rows* |
| Separate tables (profile vs billing) | Massive refactor, breaks existing queries/migrations |
| Database triggers | More complex, harder to audit, brittle |
| Application-only validation | Already in place but insufficient as defense-in-depth |

---

## 5. Files to Change

### 5.1 New Migration File

**Create:** `src/lib/db/migrations/0018_harden_users_update_columns.sql`

```sql
-- Harden authenticated role: restrict UPDATE to user-editable columns only.
-- Service-role (postgres/owner with BYPASSRLS) is unaffected.

REVOKE UPDATE ON "users" FROM authenticated;
GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
```

### 5.2 Test DB Bootstrap Updates

**Modify:** `tests/helpers/db.ts` — `ensureRlsRolesAndPermissions()`
- After the existing table-level GRANTs, add column-level REVOKE/GRANT for users table
- Must match migration logic exactly

**Modify:** `tests/setup/testcontainers.ts` — grant permissions function
- Same column-level REVOKE/GRANT additions

**Modify:** `.github/workflows/ci-trunk.yml` — CI grant steps
- Add column-level REVOKE/GRANT after the existing table-level grants

### 5.3 New Tests

**Modify:** `tests/security/rls.policies.spec.ts`
- Add test: authenticated user CANNOT update `cancelAtPeriodEnd` on own row
- Add test: authenticated user CANNOT update `stripeCustomerId` on own row
- Add test: authenticated user CAN still update `name` on own row
- Add test: authenticated user CAN still update `preferredAiModel` on own row (via `preferred_ai_model`)

### 5.4 Schema Comment Update

**Modify:** `src/lib/db/schema/tables/users.ts` (lines 67-68)
- Update comment to reflect that column-level grants now enforce the restriction at the DB layer

### 5.5 Technical Debt Documentation

**Modify:** `docs/technical-debt.md`
- Remove or mark resolved the users table column security concern (if it gets added)
- Or add a note documenting the enforcement approach

---

## 6. Risk Assessment

### Low Risk
- **Billing writes via service-role are unaffected** — `postgres` role has BYPASSRLS and is the table owner, so column-level REVOKE on `authenticated` doesn't apply
- **Existing user-facing routes are unaffected** — they only update `name` or `preferredAiModel`
- **SELECT is unaffected** — only UPDATE privileges are being restricted

### Medium Risk
- **CI/test bootstrap must be updated in lockstep** — if column-level grants aren't applied in test environments, RLS tests won't reflect production behavior
- **Future migrations adding user-editable columns** must also update the GRANT list — this is a manual step that could be missed

### Mitigations
- Tests explicitly verify column-level restrictions (catches regressions)
- Schema comment documents the pattern for future developers
- Migration file is self-documenting with clear comments

---

## 7. Cross-Slice Overlap

### Related PRDs / Issues
- **`security-boundary-update/` (Issue #282)** — Removes `getDb()` defaults from dbClient params; complementary to this work
- **`fix-dependency-direction-violations/` (Issues #272-#275)** — All completed; no longer a blocker
- **`launch-readiness-audit/phase3-todos.md`** — Referenced #297 as deferred follow-up work

### Dependencies
- **None blocking.** The dependency violations (#272-#275) that were previously blocking are resolved.
- Migration #0018 can be created independently.

---

## 8. TDD Steps

1. **RED:** Write test in `rls.policies.spec.ts` that an authenticated user attempting `UPDATE users SET cancel_at_period_end = true` on their own row fails (currently passes → test will pass initially since grants aren't restricted yet, so we need to verify the test catches the *absence* of restriction)
2. **Approach:** Write tests first that assert the *desired* behavior (column restriction), apply migration, verify tests pass
3. **GREEN:** Apply migration `0018`, update test bootstrap, run tests
4. **REFACTOR:** Clean up schema comments, update technical debt docs

### Test Strategy
Since we can't make a test "red" before the migration (the UPDATE would succeed), the TDD flow is:
1. Write a test that attempts to update a billing column and **expects it to fail**
2. Run it — it will **FAIL** (test expects failure, but UPDATE succeeds) → RED ✅
3. Apply migration + bootstrap changes → UPDATE now fails → test passes → GREEN ✅

---

## 9. Open Questions

1. **Should `subscriptionTier` be in the restricted set?** — Currently only written by service-role via Stripe webhooks. Answer: **Yes**, include it in the restricted set.
2. **Should `email` be grantable?** — Currently no route updates email. Answer: **No**, keep it restricted (immutable system field).
3. **Should we also restrict INSERT columns?** — The `users_insert_own` policy allows inserting with any columns. For INSERT, restricting columns is less critical since there's only one creation path. Defer to a follow-up if needed.
4. **Neon production role setup** — Need to verify that the `authenticated` role in Neon production has the same grant structure. The migration should handle this since it runs in production via `pnpm db:migrate`.
