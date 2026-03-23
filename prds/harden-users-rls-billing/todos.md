# Harden users_update_own RLS for Billing Fields

**Parent Issue:** [#297](https://github.com/saldanaj97/atlaris/issues/297)
**Research:** [research.md](./research.md)

---

## Slices

### Slice 1 — Enforce column-level UPDATE privileges on users table
**Issue:** [#299](https://github.com/saldanaj97/atlaris/issues/299)
**Type:** AFK | **Blocked by:** None

- [x] Create migration `src/lib/db/migrations/0018_harden_users_update_columns.sql`
  - `REVOKE UPDATE ON "users" FROM authenticated`
  - `GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated`
- [x] Update `tests/helpers/db.ts` — add column-level REVOKE/GRANT after table-level grants in `ensureRlsRolesAndPermissions()`
- [x] Update `tests/setup/testcontainers.ts` — add column-level REVOKE/GRANT in grant permissions function
- [x] Update `.github/workflows/ci-trunk.yml` — add column-level REVOKE/GRANT in E2E and Integration grant steps
- [x] Verify existing user-facing routes (`/api/v1/user/profile`, `/api/v1/user/preferences`) still work (type-check; behavior unchanged at app layer)
- [x] Verify Stripe webhook billing writes (service-role) are unaffected (design: owner/BYPASSRLS; no code path change)

### Slice 2 — Security tests + documentation for column-level restrictions
**Issue:** [#300](https://github.com/saldanaj97/atlaris/issues/300)
**Type:** AFK | **Blocked by:** [#299](https://github.com/saldanaj97/atlaris/issues/299)

- [x] Add test: authenticated user CANNOT update `cancel_at_period_end` on own row
- [x] Add test: authenticated user CANNOT update `stripe_customer_id` on own row
- [x] Add test: authenticated user CANNOT update `subscription_status` on own row
- [x] Add test: authenticated user CAN update `name` on own row
- [x] Add test: authenticated user CAN update `preferred_ai_model` on own row
- [x] Update schema comment in `src/lib/db/schema/tables/users.ts` (lines 67-68) — replace "application-level validation" note with DB-layer enforcement reference
- [x] Update `docs/technical-debt.md` — document column-level security pattern and note future columns need GRANT updates
- [x] Verify all existing tests pass (incl. `RUN_RLS_TESTS=1` security suite)

---

## Notes

- **Drizzle limitation:** `pgPolicy` API has no column-restriction support — must use raw SQL GRANT/REVOKE in migrations
- **Service-role unaffected:** `postgres` role has BYPASSRLS and is the table owner; column-level REVOKE on `authenticated` doesn't apply
- **Future columns:** When adding new user-editable columns to `users`, the GRANT list must be updated in 4 locations (migration, db.ts, testcontainers.ts, ci-trunk.yml)
- **TDD flow for Slice 2:** Write tests expecting column restriction → they fail (RED) before #299 applied → apply grants → tests pass (GREEN)
- **Testcontainers:** `tests/setup/testcontainers.ts` now runs `pnpm db:migrate` instead of `drizzle-kit push` so policy SQL matches the migration chain (fixes RLS test drift vs `push`-only DBs).

---

## Review (implementation)

- Column-level `REVOKE UPDATE` / `GRANT UPDATE (...)` on `users` for `authenticated` added in migration `0018`, journal, `tests/helpers/db.ts`, `grantRlsPermissions` in testcontainers, and CI (E2E + Integration).
- Security test uses `expectRlsViolation` for billing column updates; documents Drizzle-wrapped errors.
- Anonymous update/delete learning plan test updated to expect permission errors (anonymous has no table UPDATE).
- Testcontainers schema apply switched to `pnpm db:migrate` so policies align with migrations (e.g. `auth_user_id` in nested policy subqueries).
