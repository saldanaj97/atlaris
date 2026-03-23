-- Restrict authenticated role to only update user-editable columns.
-- Service-role (postgres/owner with BYPASSRLS) is unaffected.
REVOKE UPDATE ON "users" FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, preferred_ai_model, updated_at) ON "users" TO authenticated;
