CREATE TYPE "public"."plan_origin" AS ENUM('ai', 'template', 'manual', 'pdf');--> statement-breakpoint
UPDATE "learning_plans"
SET "origin" = 'ai'
WHERE "origin" IS NULL
  OR "origin" NOT IN ('ai', 'template', 'manual', 'pdf');--> statement-breakpoint
ALTER TABLE "learning_plans" ALTER COLUMN "origin" SET DEFAULT 'ai'::"public"."plan_origin";--> statement-breakpoint
ALTER TABLE "learning_plans" ALTER COLUMN "origin" SET DATA TYPE "public"."plan_origin" USING "origin"::"public"."plan_origin";--> statement-breakpoint
CREATE INDEX "idx_learning_plans_user_origin" ON "learning_plans" USING btree ("user_id","origin");--> statement-breakpoint
ALTER TABLE "oauth_state_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "oauth_state_tokens_insert" ON "oauth_state_tokens";--> statement-breakpoint
DROP POLICY IF EXISTS "oauth_state_tokens_select" ON "oauth_state_tokens";--> statement-breakpoint
DROP POLICY IF EXISTS "oauth_state_tokens_delete" ON "oauth_state_tokens";--> statement-breakpoint
CREATE POLICY "oauth_state_tokens_insert" ON "oauth_state_tokens"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
  );--> statement-breakpoint
CREATE POLICY "oauth_state_tokens_select" ON "oauth_state_tokens"
  AS PERMISSIVE FOR SELECT TO public
  USING (
    clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
  );--> statement-breakpoint
CREATE POLICY "oauth_state_tokens_delete" ON "oauth_state_tokens"
  AS PERMISSIVE FOR DELETE TO public
  USING (
    clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
  );
