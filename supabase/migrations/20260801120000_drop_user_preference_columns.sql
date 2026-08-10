REVOKE UPDATE ON "users" FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, updated_at) ON "users" TO authenticated;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "preferred_ai_model";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "analytics_timezone";
