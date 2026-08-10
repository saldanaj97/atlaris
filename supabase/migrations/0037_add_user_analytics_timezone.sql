ALTER TABLE "users" ADD COLUMN "analytics_timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
REVOKE UPDATE ON "users" FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, preferred_ai_model, analytics_timezone, updated_at) ON "users" TO authenticated;
