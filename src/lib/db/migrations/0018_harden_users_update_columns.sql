-- Restrict authenticated role to only update user-editable columns.
-- Service-role (postgres/owner with BYPASSRLS) is unaffected.
-- Column list must match src/lib/db/privileges/users-authenticated-update-columns.ts
-- (Testcontainers and tests/helpers/db/rls-bootstrap.ts mirror this grant for ephemeral DBs).
REVOKE UPDATE ON "users" FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
